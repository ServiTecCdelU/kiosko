// services/pedidos-service.ts — pedidos de la tienda online (plan Tienda, etapa 2).
// Lecturas por /api/consultas/pedidos; el cambio de estado por /api/pedidos.
import { apiUrl } from "@/lib/utils/api-url";
import { consultar } from "@/services/api-client";
import { mapRow } from "@/services/products-service";
import type { EstadoPedido, ItemGuardado } from "@/lib/tienda";
import type { CartItem, Product } from "@/lib/types";

export interface Pedido {
  id: string;
  numero: number;
  clienteNombre: string;
  clienteTelefono: string;
  entrega: "retiro" | "envio";
  direccion: string | null;
  pago: "efectivo" | "transferencia" | "mercadopago";
  nota: string | null;
  items: ItemGuardado[];
  total: number;
  estado: EstadoPedido;
  ventaId: string | null;
  createdAt: string;
}

function mapPedido(d: Record<string, any>): Pedido {
  return {
    id: String(d.id),
    numero: Number(d.numero),
    clienteNombre: String(d.cliente_nombre ?? ""),
    clienteTelefono: String(d.cliente_telefono ?? ""),
    entrega: d.entrega === "envio" ? "envio" : "retiro",
    direccion: d.direccion ?? null,
    pago: d.pago,
    nota: d.nota ?? null,
    items: Array.isArray(d.items) ? d.items : [],
    total: Number(d.total) || 0,
    estado: d.estado,
    ventaId: d.venta_id ?? null,
    createdAt: String(d.created_at),
  };
}

/** Sin estado: los activos (nuevo, preparando, listo). */
export async function listarPedidos(estado?: EstadoPedido): Promise<Pedido[]> {
  const { pedidos } = await consultar<{ pedidos: Record<string, any>[] }>("/api/consultas/pedidos", "listar", estado ? { estado } : {});
  return pedidos.map(mapPedido);
}

export async function obtenerPedido(id: string): Promise<{ pedido: Pedido | null; productos: Product[] }> {
  const { pedido, productos } = await consultar<{ pedido: Record<string, any> | null; productos: Record<string, any>[] }>(
    "/api/consultas/pedidos", "obtener", { id },
  );
  return { pedido: pedido ? mapPedido(pedido) : null, productos: productos.map(mapRow) };
}

export async function contarPedidosNuevos(): Promise<number> {
  const { nuevos } = await consultar<{ nuevos: number }>("/api/consultas/pedidos", "nuevos");
  return Number(nuevos) || 0;
}

export async function cambiarEstadoPedido(id: string, estado: EstadoPedido): Promise<void> {
  const res = await fetch(apiUrl("/api/pedidos"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, estado }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo cambiar el pedido");
}

/**
 * Carrito para cobrar un pedido con los productos de hoy (precio de hoy: lo de por kg
 * se pesa en la caja). Lo que ya no existe o se desactivo queda afuera (se avisa).
 */
export function carritoDePedido(p: Pedido, productos: Product[]): { items: CartItem[]; faltantes: string[] } {
  const porId = new Map(productos.map((x) => [x.id, x]));
  const items: CartItem[] = [];
  const faltantes: string[] = [];
  for (const it of p.items) {
    const prod = porId.get(it.productId);
    if (!prod || prod.disabled) {
      faltantes.push(it.name);
      continue;
    }
    items.push({ product: prod, quantity: it.quantity });
  }
  return { items, faltantes };
}
