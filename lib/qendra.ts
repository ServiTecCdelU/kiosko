// lib/qendra.ts — archivo de productos para Qendra (Systel), que los transmite a las
// balanzas Cuora. Puro y testeado.
//
// Formato (instructivo Systel "Metodologia para interconectar datos entre un sistema de
// administracion y el sistema de gestion Qendra"): CSV separado por ";" sin encabezado,
//   Seccion;Codigo PLU;Descripcion;Numero de PLU;Precio 1;Precio 2;Tipo de venta;Vencimiento;Ingredientes
//   Carniceria;105;Chorizo colorado;105;19,00;0,00;P;0;;
// Seccion y descripcion: hasta 18 caracteres y solo los que muestra la Cuora. Numero de
// PLU 1-4000 (posicion en la balanza); el codigo PLU es el del codigo de barras. Se usa
// el mismo numero para los dos, como recomienda Systel: es productos.codigo, el que
// ya lee el POS en las etiquetas (lib/barcode-balanza.ts).

export const PLU_MAX = 4000;
const LARGO_TEXTO = 18;

export interface ProductoQendra {
  name: string;
  codigo?: string | null;
  price: number;
  unidad: string;
  category?: string | null;
  disabled?: boolean;
}

export interface ResultadoQendra {
  /** Lineas del archivo (sin fin de linea). */
  lineas: string[];
  incluidos: number;
  /** Productos por kg que no se pudieron pasar, con el motivo. */
  omitidos: { name: string; motivo: string }[];
}

// La Cuora solo muestra ASCII imprimible mas ñ, Ñ y º (instructivo, nota 1).
const PERMITIDOS = /[^ !"#$%&´()*+,\-./0-9:<=>?@A-Z[\\\]º_`a-z{|}ñÑ]/g;

/** Saca acentos (salvo ñ), el ";" que partiria el campo y lo que la Cuora no muestra. */
export function textoCuora(s: string, largo = LARGO_TEXTO): string {
  const sinAcentos = s
    .replace(/ñ/g, "\u0001").replace(/Ñ/g, "\u0002")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\u0001/g, "ñ").replace(/\u0002/g, "Ñ");
  return sinAcentos.replace(/;/g, ",").replace(PERMITIDOS, "").replace(/\s+/g, " ").trim().slice(0, largo).trim();
}

/** "19,00": coma decimal (configuracion regional argentina) y sin simbolo de moneda. */
export function precioQendra(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}

/** PLU valido para la balanza: entero de 1 a 4000. */
export function pluDe(codigo: string | null | undefined): number | null {
  const c = (codigo ?? "").trim();
  if (!/^\d{1,4}$/.test(c)) return null;
  const n = Number(c);
  return n >= 1 && n <= PLU_MAX ? n : null;
}

/**
 * Productos que van a la balanza: los que tienen como codigo un PLU (1-4000). Los
 * de venta por kg sin PLU se informan (no se pueden pesar en la Cuora); los de
 * unidad sin PLU simplemente no van.
 * `seccion`: null = la seccion sale del rubro del producto ("Carniceria / Vaca" -> "Carniceria").
 */
export function generarQendra(productos: ProductoQendra[], seccion: string | null = null): ResultadoQendra {
  const lineas: string[] = [];
  const omitidos: { name: string; motivo: string }[] = [];
  const usados = new Set<number>();

  for (const p of productos) {
    if (p.disabled) continue;
    const plu = pluDe(p.codigo);
    if (plu === null) {
      if (p.unidad === "kg") omitidos.push({ name: p.name, motivo: "sin código de balanza (PLU de 1 a 4000)" });
      continue;
    }
    if (usados.has(plu)) {
      omitidos.push({ name: p.name, motivo: `el PLU ${plu} ya lo usa otro producto` });
      continue;
    }
    if (!(p.price > 0)) {
      omitidos.push({ name: p.name, motivo: "sin precio" });
      continue;
    }
    const descripcion = textoCuora(p.name);
    if (!descripcion) {
      omitidos.push({ name: p.name, motivo: "el nombre no tiene caracteres que muestre la balanza" });
      continue;
    }
    usados.add(plu);
    const sec = textoCuora(seccion ?? (p.category ?? "").split(" / ")[0]) || "General";
    lineas.push([
      sec, plu, descripcion, plu, precioQendra(p.price), "0,00",
      p.unidad === "kg" ? "P" : "U", 0, "",
    ].join(";") + ";");
  }
  return { lineas, incluidos: lineas.length, omitidos };
}

/**
 * Bytes del archivo en Windows-1252 (Qendra es un programa de Windows: en UTF-8 la ñ
 * llega rota) con fin de linea CRLF.
 */
export function bytesQendra(lineas: string[]): Uint8Array<ArrayBuffer> {
  const texto = lineas.map((l) => `${l}\r\n`).join("");
  const especiales: Record<string, number> = { "ñ": 0xf1, "Ñ": 0xd1, "º": 0xba, "´": 0xb4 };
  const out = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    out[i] = especiales[c] ?? (c.charCodeAt(0) < 0x80 ? c.charCodeAt(0) : 0x3f); // "?" si algo se escapo
  }
  return out;
}
