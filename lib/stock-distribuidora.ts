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
  productoId: string;
  distId: string;
  nombre: string;
  codigo: string | null;
  stockComercio: number;
  /** null: la distribuidora no lo tiene (o no respondio). */
  stockDistribuidora: number | null;
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
