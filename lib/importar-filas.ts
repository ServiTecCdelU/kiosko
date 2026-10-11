// lib/importar-filas.ts — helpers puros para importar planillas (Excel o CSV):
// letras de columna, numeros en formato argentino y el parseo de clientes.
// Sin imports con alias, para testearlo con node:test.

export function indexToLetter(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function letterToIndex(letter?: string): number {
  if (!letter) return -1;
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Numero escrito como en Argentina o como en Excel: "1.500,50", "1500.50",
 * "$ 1.500", "12,5". Devuelve null si no hay numero.
 */
export function parsearNumero(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? "").trim().replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // Los dos separadores: el ultimo es el decimal.
    s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma >= 0) {
    const partes = s.split(",");
    // Una sola coma con 1 o 2 decimales es decimal ("12,5"); si no, son miles ("1,500,000").
    s = partes.length === 2 && partes[1].length > 0 && partes[1].length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (punto >= 0) {
    const partes = s.split(".");
    // "1.500" (exactamente 3 digitos despues) o varios puntos: miles.
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Adivina la columna de cada campo mirando la fila de encabezados. */
export function adivinarMapeo<C extends string>(encabezados: string[], patrones: Record<C, RegExp>): Partial<Record<C, string>> {
  const mapeo: Partial<Record<C, string>> = {};
  for (const campo of Object.keys(patrones) as C[]) {
    const idx = encabezados.findIndex((h) => patrones[campo].test(String(h ?? "").trim()));
    if (idx >= 0) mapeo[campo] = indexToLetter(idx);
  }
  return mapeo;
}

// ---- Clientes ---------------------------------------------------------------

export type ClienteCampo = "nombre" | "telefono" | "documento" | "limite" | "saldo" | "notas";

export const CLIENTE_CAMPOS: ClienteCampo[] = ["nombre", "telefono", "documento", "saldo", "limite", "notas"];

export const CLIENTE_CAMPO_LABEL: Record<ClienteCampo, string> = {
  nombre: "Nombre (obligatorio)",
  telefono: "Teléfono",
  documento: "DNI o CUIT",
  saldo: "Deuda actual (lo que te debe)",
  limite: "Límite de fiado (0 = sin límite)",
  notas: "Notas",
};

export const CLIENTE_AUTO_MATCH: Record<ClienteCampo, RegExp> = {
  nombre: /nombre|cliente|raz[oó]n/i,
  telefono: /tel|cel|whats|movil|móvil/i,
  documento: /dni|cuit|cuil|doc/i,
  saldo: /saldo|deuda|debe|fiado/i,
  limite: /l[ií]mite|tope|cr[eé]dito/i,
  notas: /nota|obs|coment/i,
};

export type ClienteMapeo = Partial<Record<ClienteCampo, string>>;

export interface ClienteFila {
  rowNumber: number;
  nombre: string;
  telefono: string;
  documento: string;
  limiteCredito: number;
  saldo: number;
  notas: string;
  warnings: string[];
}

export interface ClientesParseados {
  filas: ClienteFila[];
  /** Filas con datos pero sin nombre: no se pueden importar. */
  sinNombre: number;
}

/** Filas crudas de la planilla (header: 1) -> clientes listos para mandar al servidor. */
export function parsearClientes(rows: string[][], mapeo: ClienteMapeo, startRow: number): ClientesParseados {
  const idx = Object.fromEntries(CLIENTE_CAMPOS.map((c) => [c, letterToIndex(mapeo[c])])) as Record<ClienteCampo, number>;
  const filas: ClienteFila[] = [];
  let sinNombre = 0;
  // Repetidos dentro del archivo: mismo documento, mismo telefono o mismo nombre.
  const vistos = { documento: new Set<string>(), telefono: new Set<string>(), nombre: new Set<string>() };

  rows.slice(startRow - 1).forEach((r, i) => {
    const get = (j: number) => (j >= 0 ? String(r[j] ?? "").trim() : "");
    if (r.every((c) => String(c ?? "").trim() === "")) return;
    const nombre = get(idx.nombre).replace(/\s+/g, " ");
    if (!nombre) {
      sinNombre++;
      return;
    }
    const telefono = get(idx.telefono);
    const documento = get(idx.documento).replace(/[^\d\-kK]/g, "");
    const saldoN = parsearNumero(get(idx.saldo));
    const limiteN = parsearNumero(get(idx.limite));
    const warnings: string[] = [];
    if (telefono && telefono.replace(/\D/g, "").length < 6) warnings.push("teléfono raro");
    let saldo = saldoN ?? 0;
    if (saldo < 0) {
      warnings.push("deuda negativa: se ignora");
      saldo = 0;
    }
    let limiteCredito = limiteN ?? 0;
    if (limiteCredito < 0) limiteCredito = 0;
    const telDigitos = telefono.replace(/\D/g, "");
    const nombreClave = nombre.toLowerCase();
    const repetido =
      (documento && vistos.documento.has(documento)) ||
      (telDigitos.length >= 6 && vistos.telefono.has(telDigitos)) ||
      vistos.nombre.has(nombreClave);
    if (repetido) warnings.push("repetido en el archivo");
    if (documento) vistos.documento.add(documento);
    if (telDigitos.length >= 6) vistos.telefono.add(telDigitos);
    vistos.nombre.add(nombreClave);

    filas.push({
      rowNumber: startRow + i,
      nombre, telefono, documento,
      limiteCredito: Math.round(limiteCredito * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
      notas: get(idx.notas),
      warnings,
    });
  });

  return { filas, sinNombre };
}
