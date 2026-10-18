// services/presupuestos-service.ts — presupuestos (crear, listar, anular, pasar a venta).
import { apiUrl } from "@/lib/utils/api-url";
import { consultar } from "@/services/api-client";
import { mapRow } from "@/services/products-service";
import { preciosPresupuestados, type EstadoPresupuesto, type ItemPresupuesto } from "@/lib/presupuesto";
import { precioFinal } from "@/lib/pricing";
import type { CartItem, Product } from "@/lib/types";

export interface Presupuesto {
  id: string;
  numero: number;
  clienteId?: string;
  clienteNombre?: string;
  items: ItemPresupuesto[];
  total: number;
  validezDias: number;
  /** "YYYY-MM-DD" */
  vence: string;
  estado: EstadoPresupuesto;
  ventaId?: string;
  notas?: string;
  creadoPorNombre?: string;
  createdAt: Date;
}

function mapPresupuesto(d: Record<string, any>): Presupuesto {
  return {
    id: d.id,
    numero: Number(d.numero) || 0,
    clienteId: d.cliente_id ?? undefined,
    clienteNombre: d.cliente_nombre ?? undefined,
    items: Array.isArray(d.items) ? d.items : [],
    total: Number(d.total) || 0,
    validezDias: Number(d.validez_dias) || 0,
    vence: String(d.vence ?? ""),
    estado: d.estado === "vendido" || d.estado === "anulado" ? d.estado : "vigente",
    ventaId: d.venta_id ?? undefined,
    notas: d.notas ?? undefined,
    creadoPorNombre: d.creado_por_nombre ?? undefined,
    createdAt: new Date(d.created_at),
  };
}

export interface CrearPresupuestoInput {
  items: { productId: string; name: string; quantity: number; price: number }[];
  clienteId?: string;
  clienteNombre?: string;
  validezDias: number;
  notas?: string;
}

export async function crearPresupuesto(input: CrearPresupuestoInput): Promise<Presupuesto> {
  const res = await fetch(apiUrl("/api/presupuestos"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el presupuesto");
  return mapPresupuesto(data.presupuesto);
}

export async function anularPresupuesto(id: string): Promise<void> {
  const res = await fetch(apiUrl("/api/presupuestos"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, accion: "anular" }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo anular el presupuesto");
}

export async function listarPresupuestos(q = ""): Promise<Presupuesto[]> {
  const { presupuestos } = await consultar<{ presupuestos: Record<string, any>[] }>(
    "/api/consultas/presupuestos", "listar", { q },
  );
  return presupuestos.map(mapPresupuesto);
}

export async function obtenerPresupuesto(id: string): Promise<{ presupuesto: Presupuesto | null; productos: Product[] }> {
  const { presupuesto, productos } = await consultar<{ presupuesto: Record<string, any> | null; productos: Record<string, any>[] }>(
    "/api/consultas/presupuestos", "obtener", { id },
  );
  return { presupuesto: presupuesto ? mapPresupuesto(presupuesto) : null, productos: productos.map(mapRow) };
}

/**
 * Carrito para cobrar un presupuesto, con los productos de hoy. Lo que ya no existe
 * queda afuera (se avisa). Si esta vigente y el precio presupuestado es menor, la
 * linea lo muestra (el servidor cobra el menor igual: lib/presupuesto.ts).
 */
export function carritoDePresupuesto(
  p: Presupuesto,
  productos: Product[],
  vigente: boolean,
): { items: CartItem[]; faltantes: string[] } {
  const presupuestados = preciosPresupuestados(p.items);
  const porId = new Map(productos.map((x) => [x.id, x]));
  const items: CartItem[] = [];
  const faltantes: string[] = [];
  for (const it of p.items) {
    const prod = porId.get(it.productId);
    if (!prod || prod.disabled) {
      faltantes.push(it.name);
      continue;
    }
    if (prod.precioLibre) {
      // Precio libre: el importe presupuestado es el precio de la linea.
      items.push({ product: { ...prod, price: it.price }, quantity: it.quantity });
      continue;
    }
    const prometido = presupuestados.get(it.productId);
    const respetar = vigente && prometido !== undefined && prometido < precioFinal(prod);
    items.push({
      product: respetar ? { ...prod, price: Math.round(prometido * 100) / 100, ofertaActiva: false } : prod,
      quantity: it.quantity,
    });
  }
  return { items, faltantes };
}
