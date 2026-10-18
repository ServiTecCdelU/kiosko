// lib/balanza-serie.ts — lectura del peso de una balanza conectada a la PC (puerto
// serie RS-232 o USB que Windows ve como puerto COM). Puro: arma el pedido y entiende
// la respuesta; el puerto lo maneja lib/balanza-puerto.ts (Web Serial, Chrome/Edge).
//
// Protocolos (manual "Comunicacion serial equipos Systel Rev 10" y manuales Kretz):
//   systel-a  pide $05 -> STX + peso (6/7 car., como el visor) + ETX + XOR. $11 = inestable.
//   systel-b  pide $07 -> peso (5/6 car.) + 'e'/'i' (estable/inestable) + XOR.
//   torrey    pide "P" -> CR + peso con punto ("-###.###"). Systel C, Kretz, Torrey.
//   cas       pide "W" -> STX + peso + CR. Systel D, CAS y compatibles.
//   continuo  no pide: la balanza manda el peso todo el tiempo (Kretz, Moretti...).
// Todos a 9600 8N1 por defecto. Un numero sin coma ni punto ("000710") son gramos
// (decimales configurables por si una balanza manda otra cosa).

export type ProtocoloBalanza = "systel-a" | "systel-b" | "torrey" | "cas" | "continuo";

export interface InfoProtocolo {
  id: ProtocoloBalanza;
  nombre: string;
  /** Bytes que se mandan para pedir el peso (null: la balanza transmite sola). */
  pedido: number[] | null;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export const PROTOCOLOS: InfoProtocolo[] = [
  { id: "systel-a", nombre: "Systel A (pedido $05)", pedido: [0x05] },
  { id: "systel-b", nombre: "Systel B (pedido $07, con estabilidad)", pedido: [0x07] },
  { id: "torrey", nombre: "Torrey / Kretz (pedido \"P\")", pedido: ascii("P") },
  { id: "cas", nombre: "CAS (pedido \"W\")", pedido: ascii("W") },
  { id: "continuo", nombre: "Transmisión continua", pedido: null },
];

/** Marcas comunes en Argentina y en que orden conviene probar los protocolos. */
export const MARCAS_BALANZA: { id: string; nombre: string; protocolos: ProtocoloBalanza[] }[] = [
  { id: "systel", nombre: "Systel (Cuora, Clipse, Croma, Bumer…)", protocolos: ["systel-a", "systel-b", "torrey", "cas"] },
  { id: "kretz", nombre: "Kretz (Report, Single, Elite, Aura…)", protocolos: ["torrey", "cas", "continuo"] },
  { id: "moretti", nombre: "Moretti", protocolos: ["torrey", "cas", "continuo"] },
  { id: "cas", nombre: "CAS", protocolos: ["cas", "torrey", "continuo"] },
  { id: "dibal", nombre: "Dibal", protocolos: ["cas", "torrey", "continuo"] },
  { id: "toledo", nombre: "Toledo / Prix", protocolos: ["cas", "torrey", "continuo"] },
  { id: "otra", nombre: "Otra marca", protocolos: ["systel-a", "torrey", "cas", "systel-b", "continuo"] },
];

export const BAUDIOS = [9600, 4800, 2400, 19200] as const;

export type LecturaPeso =
  | { tipo: "peso"; kg: number; estable: boolean }
  | { tipo: "inestable" }
  /** Todavia no llego una trama completa (seguir leyendo). */
  | { tipo: "nada" }
  | { tipo: "error"; motivo: string };

const STX = 0x02, ETX = 0x03, CR = 0x0d, LF = 0x0a, DC1 = 0x11;

function xor(bytes: ArrayLike<number>, desde: number, hasta: number): number {
  let x = 0;
  for (let i = desde; i < hasta; i++) x ^= bytes[i];
  return x;
}

const texto = (bytes: ArrayLike<number>, desde = 0, hasta = bytes.length) =>
  String.fromCharCode(...Array.from(bytes).slice(desde, hasta));

/** "000710" -> 0,710 kg (gramos); "000,075" o "0.075" -> 0,075 kg. null si no hay numero. */
export function textoAKg(t: string, decimalesSinSeparador = 3): number | null {
  const m = /(-?)\s*(\d+(?:[.,]\d+)?)/.exec(t);
  if (!m) return null;
  const num = m[2];
  const valor = /[.,]/.test(num)
    ? Number(num.replace(",", "."))
    : Number(num) / 10 ** decimalesSinSeparador;
  if (!Number.isFinite(valor)) return null;
  const kg = Math.round((m[1] ? -valor : valor) * 1000) / 1000;
  return kg;
}

function pesoDe(kg: number | null, estable: boolean): LecturaPeso {
  if (kg === null) return { tipo: "error", motivo: "La balanza no mandó un número" };
  return { tipo: "peso", kg, estable };
}

/**
 * Interpreta lo que mando la balanza. Para "continuo", usa la ultima linea completa.
 * Un peso negativo o cero se devuelve tal cual: decide quien llama.
 */
export function leerTrama(bytes: ArrayLike<number>, protocolo: ProtocoloBalanza, decimalesSinSeparador = 3): LecturaPeso {
  if (bytes.length === 0) return { tipo: "nada" };

  if (protocolo === "systel-a") {
    const ini = Array.prototype.indexOf.call(bytes, STX) as number;
    if (ini < 0) return Array.prototype.includes.call(bytes, DC1) ? { tipo: "inestable" } : { tipo: "nada" };
    let fin = -1;
    for (let i = ini + 1; i < bytes.length; i++) if (bytes[i] === ETX) { fin = i; break; }
    if (fin < 0 || fin + 1 >= bytes.length) return { tipo: "nada" }; // falta el ETX o la verificacion
    if (xor(bytes, ini, fin + 1) !== bytes[fin + 1]) return { tipo: "error", motivo: "Llegó una trama con error (verificación)" };
    return pesoDe(textoAKg(texto(bytes, ini + 1, fin), decimalesSinSeparador), true);
  }

  if (protocolo === "systel-b") {
    const t = texto(bytes);
    const k = t.search(/[ei]/);
    if (k < 0 || k + 1 >= bytes.length) return { tipo: "nada" };
    // Desde el primer digito o signo hasta la e/i, inclusive.
    const ini = t.slice(0, k).search(/[-\d]/);
    if (ini < 0) return { tipo: "error", motivo: "La balanza no mandó un número" };
    if (xor(bytes, ini, k + 1) !== bytes[k + 1]) return { tipo: "error", motivo: "Llegó una trama con error (verificación)" };
    if (t[k] === "i") return { tipo: "inestable" };
    return pesoDe(textoAKg(t.slice(ini, k), decimalesSinSeparador), true);
  }

  // torrey / cas / continuo: texto con separadores CR, LF, STX o ETX.
  const t = texto(bytes);
  const terminaEnSeparador = [CR, LF, ETX].includes(bytes[bytes.length - 1]);
  const partes = t.split(/[\r\n\x02\x03]/);
  // En torrey el CR va adelante ("\r-001.250"): la ultima parte ya esta completa.
  const completas = protocolo === "torrey" || terminaEnSeparador ? partes : partes.slice(0, -1);
  for (let i = completas.length - 1; i >= 0; i--) {
    const parte = completas[i].trim();
    if (!/\d/.test(parte)) continue;
    // Algunas balanzas marcan la estabilidad en continuo ("US" inestable, "ST" estable).
    if (/\bUS\b/i.test(parte)) return { tipo: "inestable" };
    return pesoDe(textoAKg(parte, decimalesSinSeparador), true);
  }
  return { tipo: "nada" };
}
