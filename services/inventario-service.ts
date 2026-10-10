// services/inventario-service.ts — recuento fisico de stock (client).
import { apiUrl } from "@/lib/utils/api-url";
import { consultar } from "@/services/api-client";
import type { ItemInventario } from "@/lib/inventario";

export type InventarioEstado = "abierto" | "cerrado" | "cancelado";

export interface Inventario {
  id: string;
  nombre: string;
  categoria?: string;
  estado: InventarioEstado;
  usuarioNombre?: string;
  productos: number;
  contados: number;
  conDiferencia: number;
  diferenciaValor: number;
  createdAt: Date;
  cerradoAt?: Date;
}

export interface ItemInventarioCerrado extends ItemInventario {
  stockAlCerrar?: number;
  diferencia?: number;
  contadoPor?: string;
}

function mapInventario(d: Record<string, any>): Inventario {
  return {
    id: d.id,
    nombre: d.nombre ?? "",
    categoria: d.categoria ?? undefined,
    estado: d.estado,
    usuarioNombre: d.usuario_nombre ?? undefined,
    productos: Number(d.productos) || 0,
    contados: Number(d.contados) || 0,
    conDiferencia: Number(d.con_diferencia) || 0,
    diferenciaValor: Number(d.diferencia_valor) || 0,
    createdAt: new Date(d.created_at),
    cerradoAt: d.cerrado_at ? new Date(d.cerrado_at) : undefined,
  };
}

function mapItem(d: Record<string, any>, costos: Record<string, number | null>): ItemInventarioCerrado {
  const costo = costos[d.producto_id];
  return {
    productoId: d.producto_id,
    nombre: d.producto_nombre,
    codigoBarras: d.codigo_barras ?? undefined,
    categoria: d.categoria ?? undefined,
    stockSistema: Number(d.stock_sistema) || 0,
    contado: d.contado != null ? Number(d.contado) : undefined,
    costo: costo != null ? costo : undefined,
    stockAlCerrar: d.stock_al_cerrar != null ? Number(d.stock_al_cerrar) : undefined,
    diferencia: d.diferencia != null ? Number(d.diferencia) : undefined,
    contadoPor: d.contado_por ?? undefined,
  };
}

async function escribir(metodo: "POST" | "PATCH" | "PUT" | "DELETE", body: unknown, fallo: string) {
  const res = await fetch(apiUrl("/api/inventario"), {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? fallo);
  return data;
}

export async function abrirInventario(input: {
  nombre?: string; categoria?: string; usuarioId?: string; usuarioNombre?: string;
}): Promise<{ inventarioId: string; productos: number }> {
  return escribir("POST", input, "No se pudo abrir el recuento");
}

export async function contarProducto(input: {
  inventarioId: string; productoId: string; contado: number; usuario?: string;
}): Promise<{ productoId: string; nombre: string; stockSistema: number; contado: number }> {
  return escribir("PATCH", input, "No se pudo guardar el conteo");
}

export async function cerrarInventario(input: {
  inventarioId: string; usuarioId?: string; usuarioNombre?: string;
}): Promise<{ contados: number; conDiferencia: number; diferenciaValor: number }> {
  return escribir("PUT", input, "No se pudo cerrar el recuento");
}

export async function cancelarInventario(inventarioId: string): Promise<void> {
  await escribir("DELETE", { inventarioId }, "No se pudo cancelar el recuento");
}

export async function getInventariosAbiertos(): Promise<Inventario[]> {
  const { inventarios } = await consultar<{ inventarios: Record<string, any>[] }>("/api/consultas/inventario", "abiertos");
  return inventarios.map(mapInventario);
}

export async function getHistorialInventarios(): Promise<Inventario[]> {
  const { inventarios } = await consultar<{ inventarios: Record<string, any>[] }>("/api/consultas/inventario", "historial");
  return inventarios.map(mapInventario);
}

export async function getInventarioDetalle(inventarioId: string): Promise<{ inventario: Inventario; items: ItemInventarioCerrado[] }> {
  const { inventario, items, costos } = await consultar<{
    inventario: Record<string, any>; items: Record<string, any>[]; costos: Record<string, number | null>;
  }>("/api/consultas/inventario", "detalle", { inventarioId });
  return { inventario: mapInventario(inventario), items: items.map((i) => mapItem(i, costos ?? {})) };
}
