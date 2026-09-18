// services/compras-service.ts — proveedores y recepcion de mercaderia (client)
import { consultar } from "@/services/api-client";
import { getComercioId } from "@/hooks/use-auth";

export interface Proveedor {
  id: string;
  nombre: string;
  telefono?: string;
  notas?: string;
  activo: boolean;
  createdAt: Date;
}

export type CompraEstado = "recibida" | "anulada";
export type CompraCondicion = "contado" | "cuenta_corriente";

export interface Compra {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  estado: CompraEstado;
  remito?: string;
  condicion: CompraCondicion;
  pagada: boolean;
  total: number;
  notas?: string;
  usuarioNombre?: string;
  createdAt: Date;
}

export interface CompraItem {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

function mapProveedor(d: Record<string, any>): Proveedor {
  return {
    id: d.id,
    nombre: d.nombre,
    telefono: d.telefono ?? undefined,
    notas: d.notas ?? undefined,
    activo: !!d.activo,
    createdAt: new Date(d.created_at),
  };
}

function mapCompra(d: Record<string, any>): Compra {
  return {
    id: d.id,
    proveedorId: d.proveedor_id,
    proveedorNombre: d.proveedores?.nombre ?? "—",
    estado: d.estado === "anulada" ? "anulada" : "recibida",
    remito: d.remito ?? undefined,
    condicion: d.condicion === "cuenta_corriente" ? "cuenta_corriente" : "contado",
    pagada: !!d.pagada,
    total: Number(d.total) || 0,
    notas: d.notas ?? undefined,
    usuarioNombre: d.usuario_nombre ?? undefined,
    createdAt: new Date(d.created_at),
  };
}

export async function getProveedores(): Promise<Proveedor[]> {
  const { proveedores } = await consultar<{ proveedores: Record<string, any>[] }>(
    "/api/consultas/compras", "proveedores",
  );
  return proveedores.map(mapProveedor);
}

export async function crearProveedor(input: {
  nombre: string; telefono?: string; notas?: string;
}): Promise<void> {
  const res = await fetch("/api/proveedores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el proveedor");
}

export async function actualizarProveedor(
  id: string,
  cambios: { nombre?: string; telefono?: string; notas?: string; activo?: boolean },
): Promise<void> {
  const res = await fetch("/api/proveedores", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...cambios, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo actualizar el proveedor");
}

export interface RecibirCompraInput {
  proveedorId: string;
  items: { productoId: string; cantidad: number; costoUnitario: number }[];
  remito?: string;
  condicion: CompraCondicion;
  pagada: boolean;
  notas?: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export async function recibirCompra(input: RecibirCompraInput): Promise<{ compraId: string; total: number }> {
  const res = await fetch("/api/compras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar la compra");
  return { compraId: data.compraId, total: Number(data.total) || 0 };
}

export async function anularCompra(compraId: string, usuarioId?: string): Promise<void> {
  const res = await fetch("/api/compras/anular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compraId, usuarioId, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo anular la compra");
}

export async function getCompras(proveedorId?: string, limit = 50): Promise<Compra[]> {
  const { compras } = await consultar<{ compras: Record<string, any>[] }>(
    "/api/consultas/compras", "compras", { proveedorId, limit },
  );
  return compras.map(mapCompra);
}

export async function getCompraDetalle(compraId: string): Promise<{ compra: Compra; items: CompraItem[] }> {
  const { compra, items } = await consultar<{
    compra: Record<string, any>; items: Record<string, any>[];
  }>("/api/consultas/compras", "compraDetalle", { compraId });
  return {
    compra: mapCompra(compra),
    items: items.map((i) => ({
      productoId: i.producto_id,
      productoNombre: i.producto_nombre,
      cantidad: Number(i.cantidad) || 0,
      costoUnitario: Number(i.costo_unitario) || 0,
      subtotal: Number(i.subtotal) || 0,
    })),
  };
}
