// lib/stock-distribuidora.ts — mover stock entre el comercio vinculado y la
// distribuidora (spec 2026-10-23-stock-distribuidora-design.md). Solo stock.
//
// Puro: pasos de una transferencia y validaciones. Quien llama a cada base esta
// en lib/server/distribuidora-stock.ts.
//
// Una transferencia descuenta primero en el ORIGEN (si no hay stock falla ahi y no
// se movio nada) y despues suma en el DESTINO. Son dos bases distintas: el estado
// guarda por donde va, y cada lado es idempotente por id, asi reintentar no duplica.

export type DireccionTransferencia = "a_comercio" | "a_distribuidora";
export type EstadoTransferencia = "pendiente" | "origen_ok" | "completa" | "fallida";
export type Lado = "comercio" | "distribuidora";
export type Paso = "origen" | "destino";

export interface Transferencia {
  id: string;
  productoId: string;
  distId: string;
  nombre?: string;
  cantidad: number;
  direccion: DireccionTransferencia;
  estado: EstadoTransferencia;
  pedidaEn: "comercio" | "distribuidora";
  usuario: string | null;
  error: string | null;
  createdAt: string;
}

export interface FilaStock {
  /** null: el comercio todavia no lo tiene (se da de alta al pasarle stock). */
  productoId: string | null;
  /** Id del producto en la distribuidora: identifica la fila en los dos sistemas. */
  distId: string;
  nombre: string;
  codigo: string | null;
  stockComercio: number;
  /** null: la distribuidora no lo tiene (o no respondio). */
  stockDistribuidora: number | null;
}

/** Producto de la distribuidora con su stock (accion "stock" de su integracion). */
export interface ProductoRemoto {
  id: string;
  name: string;
  codigo: string | null;
  stock: number;
  price?: number;
  category?: string;
  imageUrl?: string;
  description?: string;
}

/** Producto del comercio que vino de la distribuidora. */
export interface ProductoLocal {
  id: string;
  distId: string;
  nombre: string;
  codigo: string | null;
  stock: number;
}

/** Tope por movimiento: evita un cero de mas tipeado sin querer. */
export const CANTIDAD_MAXIMA = 100_000;

export function esDireccion(v: unknown): v is DireccionTransferencia {
  return v === "a_comercio" || v === "a_distribuidora";
}

/** Unidades enteras y positivas. null si no sirve. */
export function cantidadTransferible(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim().replace(",", ".")) : Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > CANTIDAD_MAXIMA) return null;
  return n;
}

/** Que falta hacer: descontar en el origen, sumar en el destino o nada. */
export function siguientePaso(estado: EstadoTransferencia): Paso | null {
  if (estado === "pendiente") return "origen";
  if (estado === "origen_ok") return "destino";
  return null;
}

export function ladoDelPaso(direccion: DireccionTransferencia, paso: Paso): Lado {
  const origen: Lado = direccion === "a_comercio" ? "distribuidora" : "comercio";
  if (paso === "origen") return origen;
  return origen === "comercio" ? "distribuidora" : "comercio";
}

/** Cuanto cambia el stock de la distribuidora: sale si va al comercio, entra si vuelve. */
export function deltaDistribuidora(direccion: DireccionTransferencia, cantidad: number): number {
  return direccion === "a_comercio" ? -cantidad : cantidad;
}

export function estadoTrasPaso(paso: Paso): EstadoTransferencia {
  return paso === "origen" ? "origen_ok" : "completa";
}

/** Quedo a medio camino (descontada en el origen y no sumada) o sin saber si se desconto. */
export function estaAbierta(estado: EstadoTransferencia): boolean {
  return estado === "pendiente" || estado === "origen_ok";
}

export function textoDireccion(direccion: DireccionTransferencia, comercio = "el super"): string {
  return direccion === "a_comercio" ? `Distribuidora → ${comercio}` : `${comercio[0].toUpperCase()}${comercio.slice(1)} → Distribuidora`;
}

/** Para leer filas de la base sin repetir el mapeo en cada ruta. */
export function transferenciaDesdeFila(r: any): Transferencia {
  return {
    id: r.id,
    productoId: r.producto_id,
    distId: r.dist_id,
    nombre: r.productos?.name ?? undefined,
    cantidad: Number(r.cantidad) || 0,
    direccion: r.direccion,
    estado: r.estado,
    pedidaEn: r.pedida_en,
    usuario: r.usuario ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
  };
}

/** Busqueda sin tildes por nombre o codigo, todas las palabras. */
export function filtrarFilas(filas: FilaStock[], texto: string): FilaStock[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = norm(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return filas;
  return filas.filter((f) => {
    const donde = norm(`${f.nombre} ${f.codigo ?? ""}`);
    return palabras.every((p) => donde.includes(p));
  });
}

/**
 * Una fila por producto de la distribuidora (lo tenga o no el comercio), mas los del
 * comercio que la distribuidora ya no tiene (sin stock alla). Por nombre.
 */
export function unirStock(remotos: ProductoRemoto[] | null, locales: ProductoLocal[]): FilaStock[] {
  const porDist = new Map(locales.map((l) => [l.distId, l]));
  const filas: FilaStock[] = [];
  const vistos = new Set<string>();
  for (const r of remotos ?? []) {
    const l = porDist.get(r.id);
    vistos.add(r.id);
    filas.push({
      productoId: l?.id ?? null,
      distId: r.id,
      nombre: l?.nombre || r.name || r.id,
      codigo: l?.codigo ?? r.codigo ?? null,
      stockComercio: l?.stock ?? 0,
      stockDistribuidora: Number(r.stock) || 0,
    });
  }
  for (const l of locales) {
    if (vistos.has(l.distId)) continue;
    filas.push({ productoId: l.id, distId: l.distId, nombre: l.nombre, codigo: l.codigo, stockComercio: l.stock, stockDistribuidora: null });
  }
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que tiene stock en algun lado (lo que se ve de entrada). */
export function conStock(filas: FilaStock[]): FilaStock[] {
  return filas.filter((f) => f.stockComercio > 0 || (f.stockDistribuidora ?? 0) > 0);
}

/** Cuanto se puede mover de una fila hacia ese lado (todo lo que hay en el origen, entero). */
export function disponibleParaMover(f: FilaStock, direccion: DireccionTransferencia): number {
  const n = direccion === "a_comercio" ? f.stockDistribuidora ?? 0 : f.stockComercio;
  return Math.max(0, Math.floor(n));
}

/** Movimientos de una pasada: la cantidad pedida o todo; se saltean los que no tienen. */
export function armarLote(
  filas: FilaStock[],
  direccion: DireccionTransferencia,
  cantidad: number | "todo",
): { distId: string; cantidad: number }[] {
  const lote: { distId: string; cantidad: number }[] = [];
  for (const f of filas) {
    const hay = disponibleParaMover(f, direccion);
    const n = cantidad === "todo" ? hay : Math.min(cantidad, hay);
    if (n > 0) lote.push({ distId: f.distId, cantidad: n });
  }
  return lote;
}

/** Tope de productos por pasada (cada uno son dos llamadas, una por base). */
export const MAX_POR_LOTE = 300;

/**
 * Body de "transferir" ({ distId, cantidad }) o "transferir_varios" ({ items }) ya
 * validado; un string es el mensaje de error.
 */
export function leerItems(body: any): { distId: string; cantidad: number }[] | string {
  const crudos: unknown[] = body?.accion === "transferir_varios" ? (Array.isArray(body.items) ? body.items : []) : [body];
  if (crudos.length === 0) return "No hay productos para mover";
  if (crudos.length > MAX_POR_LOTE) return `Como máximo ${MAX_POR_LOTE} productos por vez`;
  const items: { distId: string; cantidad: number }[] = [];
  for (const c of crudos as any[]) {
    if (typeof c?.distId !== "string" || !c.distId) return "Falta el producto";
    const cantidad = cantidadTransferible(c.cantidad);
    if (!cantidad) return "La cantidad tiene que ser un número entero mayor a 0";
    items.push({ distId: c.distId, cantidad });
  }
  return items;
}
