// lib/qendra.ts — archivo de productos para Qendra (Systel), que los transmite a las
// balanzas Cuora. Puro y testeado.
//
// Formato (instructivo Systel "Metodologia para interconectar datos entre un sistema de
// administracion y el sistema de gestion Qendra"): CSV separado por ";" sin encabezado,
//   Seccion;Codigo PLU;Descripcion;Numero de PLU;Precio 1;Precio 2;Tipo de venta;Vencimiento;Ingredientes
//   Carniceria;105;Chorizo colorado;105;19,00;0,00;P;0;;
// Seccion y descripcion: hasta 18 caracteres y solo los que muestra la Cuora. Codigo de
// PLU 1-99997: el del codigo de barras, es productos.codigo (el que ya lee el POS en
// las etiquetas, lib/barcode-balanza.ts). Numero de PLU 1-4000: la posicion en la
// memoria de la balanza. Systel recomienda usar el mismo numero; si el codigo pasa
// de 4000 se le da la primera posicion libre, en orden de codigo (estable mientras no
// cambien los productos).

import { precioFinal, tieneOferta, type ConOferta } from "./pricing.ts";

export const PLU_MAX = 99997;
export const POSICIONES_MAX = 4000;
const LARGO_TEXTO = 18;

/** Con los campos de oferta: la balanza recibe el precio CON la oferta de hoy (lib/pricing.ts). */
export interface ProductoQendra extends ConOferta {
  id?: string;
  /** Pack de oferta (71_productos_pack.sql): va a la balanza mientras dure el combo del base. */
  packDe?: string | null;
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
  /** Cuantos van con el precio de oferta. */
  conOferta: number;
  /**
   * Ofertas combo ("2 kg x $3.000") sin su producto pack: la balanza no las puede
   * aplicar, van a precio de lista. Con el pack creado, el combo se vende en la balanza
   * como un producto por unidad.
   */
  combos: { id?: string; name: string; category?: string | null; cantidad: number; valor: number; unidad: string }[];
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

/** Codigo de PLU valido para la balanza: entero de 1 a 99997. */
export function pluDe(codigo: string | null | undefined): number | null {
  const c = (codigo ?? "").trim();
  if (!/^\d{1,5}$/.test(c)) return null;
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
  let conOferta = 0;
  const combos: ResultadoQendra["combos"] = [];
  const elegidos: { p: ProductoQendra; plu: number; descripcion: string }[] = [];

  const porId = new Map(productos.filter((p) => p.id).map((p) => [p.id!, p]));
  const conPack = new Set(productos.filter((p) => p.packDe && !p.disabled).map((p) => p.packDe!));

  for (const p of productos) {
    if (p.disabled) continue;
    if (p.packDe) {
      const base = porId.get(p.packDe);
      if (!base || !(tieneOferta(base) && base.ofertaTipo === "combo")) {
        omitidos.push({ name: p.name, motivo: `la oferta de ${base?.name ?? "su producto"} no está vigente` });
        continue;
      }
    }
    const plu = pluDe(p.codigo);
    if (plu === null) {
      if (p.unidad === "kg") omitidos.push({ name: p.name, motivo: "sin código de balanza (número de 1 a 99997)" });
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
    elegidos.push({ p, plu, descripcion });
  }

  // Posicion en la memoria de la balanza: el mismo numero si entra, si no la primera libre.
  const ocupadas = new Set(elegidos.map((e) => e.plu).filter((n) => n <= POSICIONES_MAX));
  let libre = 1;
  const posicion = new Map<number, number>();
  for (const { plu } of [...elegidos].sort((a, b) => a.plu - b.plu)) {
    if (plu <= POSICIONES_MAX) { posicion.set(plu, plu); continue; }
    while (ocupadas.has(libre)) libre++;
    if (libre > POSICIONES_MAX) break;
    ocupadas.add(libre);
    posicion.set(plu, libre);
  }

  for (const { p, plu, descripcion } of elegidos) {
    const numero = posicion.get(plu);
    if (numero === undefined) {
      omitidos.push({ name: p.name, motivo: `la balanza ya tiene ${POSICIONES_MAX} productos` });
      continue;
    }
    // Precio por kg/unidad con la oferta vigente: la etiqueta coincide con lo que cobra la caja.
    const precio = precioFinal(p);
    if (precio < p.price) conOferta++;
    else if (tieneOferta(p) && p.ofertaTipo === "combo" && !(p.id && conPack.has(p.id))) {
      combos.push({
        id: p.id, name: p.name, category: p.category, unidad: p.unidad,
        cantidad: Number(p.ofertaCantidad) || 0, valor: Number(p.ofertaValor) || 0,
      });
    }
    const sec = textoCuora(seccion ?? (p.category ?? "").split(" / ")[0]) || "General";
    lineas.push([
      sec, plu, descripcion, numero, precioQendra(precio), "0,00",
      p.unidad === "kg" ? "P" : "U", 0, "",
    ].join(";") + ";");
  }
  return { lineas, incluidos: lineas.length, omitidos, conOferta, combos };
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

/** "Banana 2 kg oferta". La balanza muestra los primeros 18 caracteres. */
export function nombrePack(combo: { name: string; cantidad: number; unidad: string }): string {
  const cant = combo.unidad === "un" ? `x${combo.cantidad}` : `${String(combo.cantidad).replace(".", ",")} ${combo.unidad}`;
  return `${combo.name} ${cant} oferta`;
}

/** Primer codigo libre para un pack: el siguiente al mayor codigo numerico de balanza. */
export function codigoLibre(codigos: (string | null | undefined)[]): string | null {
  const usados = codigos.map(pluDe).filter((n): n is number => n !== null);
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  return siguiente <= PLU_MAX ? String(siguiente) : null;
}
