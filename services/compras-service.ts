import { apiUrl } from "@/lib/utils/api-url"
// services/compras-service.ts — proveedores y recepcion de mercaderia (client)
import { consultar } from "@/services/api-client";

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
  /** Cuanto se pago hasta ahora (migracion 44). */
  pagado: number;
  /** total - pagado, nunca negativo. */
  saldo: number;
  /** Fecha pactada de pago (YYYY-MM-DD), si la hay. */
  vence?: string;
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

export type PagoMetodo = "efectivo" | "transferencia" | "otro";

export interface PagoProveedor {
  id: string;
  proveedorId: string;
  monto: number;
  metodo: PagoMetodo;
  aplicado: { compraId: string; monto: number }[];
  cajaId?: string;
  nota?: string;
  usuarioNombre?: string;
  anuladoAt?: Date;
  fecha: Date;
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
    pagado: Number(d.pagado) || 0,
    saldo: Math.max(0, (Number(d.total) || 0) - (Number(d.pagado) || 0)),
    vence: d.vence ? String(d.vence).slice(0, 10) : undefined,
    notas: d.notas ?? undefined,
    usuarioNombre: d.usuario_nombre ?? undefined,
    createdAt: new Date(d.created_at),
  };
}

function mapPago(d: Record<string, any>): PagoProveedor {
  return {
    id: d.id,
    proveedorId: d.proveedor_id,
    monto: Number(d.monto) || 0,
    metodo: d.metodo,
    aplicado: Array.isArray(d.aplicado) ? d.aplicado.map((a: any) => ({ compraId: String(a.compraId), monto: Number(a.monto) || 0 })) : [],
    cajaId: d.caja_id ?? undefined,
    nota: d.nota ?? undefined,
    usuarioNombre: d.usuario_nombre ?? undefined,
    anuladoAt: d.anulado_at ? new Date(d.anulado_at) : undefined,
    fecha: new Date(d.fecha),
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
  const res = await fetch(apiUrl("/api/proveedores"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el proveedor");
}

export async function actualizarProveedor(
  id: string,
  cambios: { nombre?: string; telefono?: string; notas?: string; activo?: boolean },
): Promise<void> {
  const res = await fetch(apiUrl("/api/proveedores"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...cambios }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo actualizar el proveedor");
}

export interface RecibirCompraInput {
  proveedorId: string;
  /** fechaVencimiento (YYYY-MM-DD) crea un lote de vencimiento para ese item. */
  items: { productoId: string; cantidad: number; costoUnitario: number; fechaVencimiento?: string }[];
  remito?: string;
  condicion: CompraCondicion;
  pagada: boolean;
  /** Fecha pactada de pago (YYYY-MM-DD); solo si queda saldo. */
  vence?: string;
  notas?: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

/** Cambia (o borra con null) la fecha pactada de pago de una compra con saldo. */
export async function actualizarVencimientoCompra(compraId: string, vence: string | null): Promise<void> {
  const res = await fetch(apiUrl("/api/compras"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compraId, vence }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar la fecha de pago");
}

export async function recibirCompra(input: RecibirCompraInput): Promise<{ compraId: string; total: number }> {
  const res = await fetch(apiUrl("/api/compras"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar la compra");
  return { compraId: data.compraId, total: Number(data.total) || 0 };
}

export async function anularCompra(compraId: string, usuarioId?: string): Promise<void> {
  const res = await fetch(apiUrl("/api/compras/anular"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compraId, usuarioId }),
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

// ── Cuenta corriente de proveedores ───────────────────────────

export async function getComprasConSaldo(proveedorId?: string): Promise<Compra[]> {
  const { compras } = await consultar<{ compras: Record<string, any>[] }>(
    "/api/consultas/compras", "comprasConSaldo", { proveedorId },
  );
  return compras.map(mapCompra);
}

export async function getPagosProveedor(proveedorId: string, limit = 50): Promise<PagoProveedor[]> {
  const { pagos } = await consultar<{ pagos: Record<string, any>[] }>(
    "/api/consultas/compras", "pagosProveedor", { proveedorId, limit },
  );
  return pagos.map(mapPago);
}

export interface RegistrarPagoInput {
  proveedorId: string;
  monto: number;
  metodo: PagoMetodo;
  /** Compra puntual; sin esto el pago es "a cuenta" (compras mas viejas primero). */
  compraId?: string;
  /** Caja abierta de la que sale el efectivo (queda como gasto de caja). */
  cajaId?: string;
  nota?: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export async function registrarPagoProveedor(input: RegistrarPagoInput): Promise<{ pagoId: string; cajaMovId?: string }> {
  const res = await fetch(apiUrl("/api/proveedores/pagos"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar el pago");
  return { pagoId: data.pagoId, cajaMovId: data.cajaMovId ?? undefined };
}

export async function anularPagoProveedor(pagoId: string, usuarioId?: string): Promise<{ gastoConservado: boolean }> {
  const res = await fetch(apiUrl("/api/proveedores/pagos"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pagoId, usuarioId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo anular el pago");
  return { gastoConservado: !!data?.gastoConservado };
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
