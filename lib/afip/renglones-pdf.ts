// lib/afip/renglones-pdf.ts — saca los renglones (producto, cantidad, precio,
// subtotal) del texto posicionado de un PDF de factura. El PDF lo arma el
// sistema de cada proveedor, asi que esto es "best effort": primero busca la
// fila de titulos de la tabla (Código / Descripción / Cantidad / Precio /
// Subtotal) y reparte el texto por columnas; si no hay titulos, prueba por
// coherencia numerica (cantidad x precio = subtotal). Puro, testeable.
import { parsearNumero } from "../importar-filas.ts";

export interface TextoPosicionado {
  texto: string;
  /** Borde izquierdo, en puntos del PDF. */
  x: number;
  /** Linea base; en PDF crece hacia arriba. */
  y: number;
  ancho?: number;
}

export interface Renglon {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  /** Como se leyo: por columnas (confiable) o por coherencia numerica (revisar). */
  metodo: "columnas" | "numeros";
}

export interface LecturaRenglones {
  renglones: Renglon[];
  razonSocial: string | null;
  /** Por que no se pudo leer, si no hay renglones. */
  motivo?: string;
}

interface Linea {
  y: number;
  items: TextoPosicionado[];
  texto: string;
}

/** Agrupa el texto en lineas (misma altura, con tolerancia) de arriba hacia abajo. */
export function agruparLineas(items: TextoPosicionado[], tolerancia = 3): Linea[] {
  const limpios = items.filter((i) => i.texto.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas: Linea[] = [];
  for (const it of limpios) {
    const ultima = lineas[lineas.length - 1];
    if (ultima && Math.abs(ultima.y - it.y) <= tolerancia) ultima.items.push(it);
    else lineas.push({ y: it.y, items: [it], texto: "" });
  }
  for (const l of lineas) {
    l.items.sort((a, b) => a.x - b.x);
    l.texto = l.items.map((i) => i.texto.trim()).join(" ").replace(/\s+/g, " ");
  }
  return lineas;
}

type Columna = "codigo" | "descripcion" | "cantidad" | "unidad" | "precio" | "bonif" | "impBonif" | "alic" | "subtotal";

const TITULOS: [Columna, RegExp][] = [
  ["codigo", /^c[oó]d(igo)?\.?$|^c[oó]digo|^sku$|^art\.?$/i],
  ["descripcion", /descrip|producto|detalle|art[ií]culo|concepto|denominaci/i],
  ["cantidad", /^cant/i],
  ["unidad", /^u\.? ?(medida|m\.?)$|^unidad|^um$/i],
  ["precio", /precio|p\.? ?unit|unitario/i],
  ["bonif", /^%? ?bonif/i],
  ["impBonif", /imp\.? ?bonif/i],
  ["alic", /al[ií]c|^iva/i],
  ["subtotal", /subtotal|^importe|^total|monto/i],
];

const FIN_TABLA = /^(subtotal|importe otros|otros tributos|importe total|total|cae|son pesos|observaci|descuento|percepci|iva \d|neto gravado|importe neto|forma de pago|condici[oó]n|vencimiento del cae)/i;

const centro = (i: TextoPosicionado) => i.x + (i.ancho ?? 0) / 2;

function razonSocialDe(lineas: Linea[]): string | null {
  for (const l of lineas.slice(0, 40)) {
    const idx = l.items.findIndex((i) => /raz[oó]n social/i.test(i.texto));
    if (idx < 0) continue;
    const propio = l.items[idx].texto.split(":")[1]?.trim();
    if (propio) return propio;
    const siguiente = l.items[idx + 1]?.texto.trim().replace(/^:\s*/, "");
    if (siguiente) return siguiente;
  }
  return null;
}

/** Fila de titulos de la tabla: tiene "Cantidad" y alguna de precio/subtotal. */
function encontrarEncabezado(lineas: Linea[]): { indice: number; anchors: { col: Columna; cx: number }[] } | null {
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (!/cant/i.test(l.texto) || !/precio|unit|subtotal|importe|total/i.test(l.texto)) continue;
    const anchors: { col: Columna; cx: number }[] = [];
    for (const it of l.items) {
      const t = it.texto.trim();
      for (const [col, re] of TITULOS) {
        if (re.test(t) && !anchors.some((a) => a.col === col)) {
          // "Imp. Bonif." matchea bonif e impBonif: gana la mas especifica.
          if (col === "bonif" && /imp/i.test(t)) continue;
          anchors.push({ col, cx: centro(it) });
          break;
        }
      }
    }
    if (anchors.some((a) => a.col === "cantidad") && anchors.some((a) => a.col === "precio" || a.col === "subtotal")) {
      anchors.sort((a, b) => a.cx - b.cx);
      return { indice: i, anchors };
    }
  }
  return null;
}

function columnaDe(it: TextoPosicionado, anchors: { col: Columna; cx: number }[]): Columna {
  const cx = centro(it);
  let mejor = anchors[0];
  for (const a of anchors) if (Math.abs(a.cx - cx) < Math.abs(mejor.cx - cx)) mejor = a;
  return mejor.col;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function porColumnas(lineas: Linea[], enc: { indice: number; anchors: { col: Columna; cx: number }[] }): Renglon[] {
  const out: Renglon[] = [];
  for (let i = enc.indice + 1; i < lineas.length; i++) {
    const l = lineas[i];
    if (FIN_TABLA.test(l.texto)) break;
    const cols: Partial<Record<Columna, string[]>> = {};
    for (const it of l.items) {
      const c = columnaDe(it, enc.anchors);
      (cols[c] ??= []).push(it.texto.trim());
    }
    const txt = (c: Columna) => (cols[c] ?? []).join(" ").trim();
    const cantidad = parsearNumero(txt("cantidad"));
    const precio = parsearNumero(txt("precio"));
    const subtotal = parsearNumero(txt("subtotal"));
    const descripcion = txt("descripcion");

    if (cantidad != null && cantidad > 0 && (precio != null || subtotal != null)) {
      const p = precio ?? r2((subtotal as number) / cantidad);
      const s = subtotal ?? r2(cantidad * p);
      out.push({ codigo: txt("codigo"), descripcion, cantidad, precioUnitario: p, subtotal: s, metodo: "columnas" });
    } else if (descripcion && cantidad == null && precio == null && subtotal == null && out.length) {
      // Descripcion que sigue en la linea de abajo.
      out[out.length - 1].descripcion = `${out[out.length - 1].descripcion} ${descripcion}`.trim();
    }
  }
  return out;
}

/** Sin titulos: una linea es un renglon si tiene cantidad x precio = subtotal (2% de tolerancia). */
function porNumeros(lineas: Linea[]): Renglon[] {
  const out: Renglon[] = [];
  for (const l of lineas) {
    if (FIN_TABLA.test(l.texto)) continue;
    const tokens = l.texto.split(/\s+/);
    const nums = tokens.map((t) => ({ t, n: /^[\d.,$-]+$/.test(t) ? parsearNumero(t) : null }));
    const indicesNum = nums.map((x, i) => (x.n != null ? i : -1)).filter((i) => i >= 0);
    if (indicesNum.length < 3) continue;
    const k = indicesNum[indicesNum.length - 1];
    const subtotal = nums[k].n as number;
    let hallado: { cant: number; precio: number; iCant: number; iPrecio: number } | null = null;
    for (let a = 0; a < indicesNum.length - 1 && !hallado; a++) {
      for (let b = a + 1; b < indicesNum.length - 1 && !hallado; b++) {
        const x = nums[indicesNum[a]].n as number;
        const y = nums[indicesNum[b]].n as number;
        if (x <= 0 || y <= 0) continue;
        if (Math.abs(x * y - subtotal) <= Math.max(0.02 * subtotal, 0.02)) {
          const cantEsX = Number.isInteger(x) && !Number.isInteger(y) ? true : Number.isInteger(y) && !Number.isInteger(x) ? false : x <= y;
          hallado = cantEsX
            ? { cant: x, precio: y, iCant: indicesNum[a], iPrecio: indicesNum[b] }
            : { cant: y, precio: x, iCant: indicesNum[b], iPrecio: indicesNum[a] };
        }
      }
    }
    if (!hallado) continue;
    const usados = new Set([hallado.iCant, hallado.iPrecio, k]);
    const resto = tokens.filter((_, i) => !usados.has(i));
    // Un codigo largo (barra) al principio no es descripcion. El resto se deja tal
    // cual, numeros incluidos: "Yerba 1 kg" los necesita.
    const codigo = /^\d{6,14}$/.test(resto[0] ?? "") ? resto.shift()! : "";
    const descripcion = resto.join(" ").trim();
    if (!descripcion) continue;
    out.push({ codigo, descripcion, cantidad: hallado.cant, precioUnitario: hallado.precio, subtotal, metodo: "numeros" });
  }
  return out;
}

export function leerRenglones(items: TextoPosicionado[]): LecturaRenglones {
  const lineas = agruparLineas(items);
  const razonSocial = razonSocialDe(lineas);
  if (lineas.length === 0) return { renglones: [], razonSocial, motivo: "El PDF no tiene texto: es una imagen escaneada." };
  const enc = encontrarEncabezado(lineas);
  let renglones = enc ? porColumnas(lineas, enc) : [];
  if (renglones.length === 0) renglones = porNumeros(lineas);
  if (renglones.length === 0) {
    return { renglones, razonSocial, motivo: enc ? "Encontré la tabla pero no pude leer sus renglones." : "No encontré la tabla de productos en el PDF." };
  }
  return { renglones, razonSocial };
}
