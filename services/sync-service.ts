// services/sync-service.ts
// Sincroniza el catalogo desde la distribuidora hacia los productos DE UN COMERCIO.
// SERVER-SIDE: usa supabaseAdmin. Invocar desde /api/sync con el comercio de la sesion.
//
// Reglas clave:
// - SaaS: cada comercio sincroniza SU copia del catalogo (ids con el comercio
//   adelante, lib/sync-filas.ts). Se guarda por (comercio_id, dist_id): un
//   comercio nunca puede tocar productos de otro.
// - Solo se actualizan campos del catalogo (nombre, precio, categoria...). NUNCA
//   se toca el stock local del kiosko.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { leerTodo } from "@/lib/server/leer-todo";
import { filasDesdeDistribuidora, type ProductoDistribuidora } from "@/lib/sync-filas";
import type { SyncEstado } from "@/lib/types";

export interface SyncResult {
  estado: SyncEstado;
  productosCreados: number;
  productosActualizados: number;
  productosTotal: number;
  error?: string;
}

async function logSync(
  comercioId: string,
  estado: SyncEstado,
  creados: number,
  actualizados: number,
  total: number,
  startedAt: Date,
  error?: string,
): Promise<void> {
  await supabaseAdmin.from("sync_log").insert({
    id: crypto.randomUUID(),
    comercio_id: comercioId,
    estado,
    productos_creados: creados,
    productos_actualizados: actualizados,
    productos_total: total,
    error: error ?? null,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  });
}

export async function syncProductosFromDistribuidora(comercioId: string): Promise<SyncResult> {
  if (!comercioId) throw new Error("Falta el comercio de la sincronizacion");
  const startedAt = new Date();
  const base = process.env.DISTRIBUIDORA_API_URL;
  const fallo = async (error: string): Promise<SyncResult> => {
    await logSync(comercioId, "error", 0, 0, 0, startedAt, error);
    return { estado: "error", productosCreados: 0, productosActualizados: 0, productosTotal: 0, error };
  };

  if (!base) return fallo("DISTRIBUIDORA_API_URL no esta configurada");

  // 1. Traer catalogo remoto
  let remote: ProductoDistribuidora[];
  try {
    const url = `${base.replace(/\/$/, "")}/api/public/productos`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    remote = Array.isArray(json?.products) ? json.products : [];
  } catch (e) {
    return fallo(`No se pudo traer el catalogo: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Productos ya sincronizados DE ESTE comercio (para distinguir creados vs
  //    actualizados y auditar cambios de precio). Paginado: puede haber miles.
  const existentes = await leerTodo<{ id: string; price: number }>((desde, hasta) =>
    supabaseAdmin
      .from("productos")
      .select("id, price")
      .eq("comercio_id", comercioId)
      .not("dist_id", "is", null)
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
  const precioAnterior = new Map(existentes.map((r) => [r.id, Number(r.price) || 0]));

  // 3. Mapear SOLO campos del catalogo, con ids del comercio.
  const rows = filasDesdeDistribuidora(remote, comercioId, new Date().toISOString());
  const creados = rows.filter((r) => !precioAnterior.has(r.id)).length;
  const actualizados = rows.length - creados;

  // 4. Upsert por lotes por (comercio_id, dist_id): la clave incluye el comercio,
  //    asi es imposible actualizar una fila de otro kiosko.
  const CHUNK = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("productos").upsert(slice, { onConflict: "comercio_id,dist_id" });
      if (error) throw error;
    }
  } catch (e) {
    const error = `Error guardando productos: ${e instanceof Error ? e.message : String(e)}`;
    await logSync(comercioId, "parcial", creados, actualizados, rows.length, startedAt, error);
    return { estado: "parcial", productosCreados: creados, productosActualizados: actualizados, productosTotal: rows.length, error };
  }

  // 5. Auditar cambios de precio en productos que ya existian (no en altas nuevas)
  const cambiosPrecio = rows
    .filter((r) => precioAnterior.has(r.id) && precioAnterior.get(r.id) !== r.price)
    .map((r) => ({
      id: crypto.randomUUID(),
      comercio_id: comercioId,
      producto_id: r.id,
      campo: "price",
      valor_anterior: String(precioAnterior.get(r.id)),
      valor_nuevo: String(r.price),
      usuario_nombre: "Sincronización distribuidora",
    }));
  if (cambiosPrecio.length > 0) {
    await supabaseAdmin.from("producto_auditoria").insert(cambiosPrecio);
  }

  await logSync(comercioId, "ok", creados, actualizados, rows.length, startedAt);
  return { estado: "ok", productosCreados: creados, productosActualizados: actualizados, productosTotal: rows.length };
}
