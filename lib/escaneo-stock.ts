// lib/escaneo-stock.ts — cargar mercaderia con el lector de codigo de barras en Stock.
// Puro y testeado. El lector "tipea" el codigo y manda Enter: con el dialogo de
// "Sumar stock" abierto, esos digitos caen en el campo de cantidad. Aca se distingue
// una cantidad tipeada de un codigo escaneado, para no sumar 7790895000997 unidades.

/** Largo minimo de un codigo de barras (EAN-8). Una cantidad real nunca llega a tanto. */
const LARGO_CODIGO = 8;

export type EntradaCantidad =
  | { tipo: "cantidad"; valor: number }
  /** El lector escaneo un codigo encima de lo que habia en el campo. */
  | { tipo: "codigo"; codigo: string }
  | { tipo: "invalida" };

/**
 * Interpreta el campo de cantidad al apretar Enter. `antes` es lo que tenia el campo
 * antes de que el lector empezara a tipear (la cantidad que estaba).
 */
export function leerEntradaCantidad(texto: string, antes: string, porUnidad: boolean): EntradaCantidad {
  const t = texto.trim();
  // Lo escaneado se agrega detras de lo que ya habia ("1" + "7790895000997").
  const resto = antes && t.startsWith(antes) ? t.slice(antes.length) : t;
  if (/^\d+$/.test(resto) && resto.length >= LARGO_CODIGO) return { tipo: "codigo", codigo: resto };
  if (/^\d+$/.test(t) && t.length >= LARGO_CODIGO) return { tipo: "codigo", codigo: t };
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return { tipo: "invalida" };
  if (porUnidad && !Number.isInteger(n)) return { tipo: "invalida" };
  return { tipo: "cantidad", valor: porUnidad ? n : Math.round(n * 1000) / 1000 };
}

/** ¿Este codigo es del producto? (codigo interno o de barras, sin espacios). */
export function esCodigoDelProducto(codigo: string, p: { codigo?: string | null; codigoBarras?: string | null }): boolean {
  const c = codigo.trim();
  return !!c && (c === (p.codigoBarras ?? "").trim() || c === (p.codigo ?? "").trim());
}

/** Datos que devuelve Open Food Facts para un codigo (los que usamos). */
export interface ProductoExterno {
  product_name?: string | null;
  brands?: string | null;
  quantity?: string | null;
}

/**
 * Nombre sugerido para el producto nuevo: "Coca-Cola Original 2,25 L".
 * Marca adelante si el nombre no la trae; la cantidad al final con coma decimal.
 */
export function nombreSugerido(p: ProductoExterno): string | null {
  const nombre = (p.product_name ?? "").replace(/\s+/g, " ").trim();
  if (!nombre) return null;
  const marca = (p.brands ?? "").split(",")[0].trim();
  const cantidad = (p.quantity ?? "").replace(/\s+/g, " ").trim().replace(/(\d)\.(\d)/g, "$1,$2");
  let texto = marca && !nombre.toLowerCase().includes(marca.toLowerCase()) ? `${marca} ${nombre}` : nombre;
  if (cantidad && !texto.toLowerCase().includes(cantidad.toLowerCase())) texto = `${texto} ${cantidad}`;
  // Primera letra en mayuscula (Open Food Facts suele traer todo en minuscula).
  return (texto.charAt(0).toUpperCase() + texto.slice(1)).slice(0, 80);
}
