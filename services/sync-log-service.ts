// services/sync-log-service.ts
// Lectura del historial de sincronizaciones (client-side, anon).

import { supabase } from "@/lib/supabase";
import type { SyncLog } from "@/lib/types";

function mapSyncLog(d: Record<string, any>): SyncLog {
  return {
    id: d.id,
    estado: d.estado ?? "ok",
    productosCreados: d.productos_creados ?? 0,
    productosActualizados: d.productos_actualizados ?? 0,
    productosTotal: d.productos_total ?? 0,
    error: d.error ?? undefined,
    startedAt: new Date(d.started_at),
    finishedAt: d.finished_at ? new Date(d.finished_at) : undefined,
  };
}

export async function getSyncLogs(limit = 20): Promise<SyncLog[]> {
  const { data } = await supabase
    .from("sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapSyncLog);
}

export async function getProductosCount(): Promise<number> {
  const { count } = await supabase
    .from("productos")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}
