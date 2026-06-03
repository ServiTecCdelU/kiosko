// services/sync-service.ts
// Sincroniza el catalogo desde la distribuidora hacia la BD del kiosko.
// SERVER-SIDE: usa supabaseAdmin. Invocar desde /api/sync.
//
// Regla clave: solo se actualizan campos del catalogo (nombre, precio,
// categoria, etc.). NUNCA se toca el stock local del kiosko.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SyncEstado } from "@/lib/types";

interface DistribuidoraProduct {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  category?: string;
  disabled?: boolean;
  codigo?: string;
  codigoBarras?: string;
}

export interface SyncResult {
  estado: SyncEstado;
  productosCreados: number;
  productosActualizados: number;
  productosTotal: number;
  error?: string;
}

// Deriva el codigo desde el id de la distribuidora cuando no viene explicito.
// prod_mp_123 -> 123 · prod_456 -> 456
function deriveCodigo(id: string, explicit?: string): string | null {
  if (explicit) return explicit;
  if (!id) return null;
  const mp = id.match(/^prod_mp_(.+)$/);
  if (mp) return mp[1];
  const p = id.match(/^prod_(.+)$/);
  if (p) return p[1];
  return null;
}

async function logSync(
  estado: SyncEstado,
  creados: number,
  actualizados: number,
  total: number,
  startedAt: Date,
  error?: string,
): Promise<void> {
  await supabaseAdmin.from("sync_log").insert({
    estado,
    productos_creados: creados,
    productos_actualizados: actualizados,
    productos_total: total,
    error: error ?? null,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  });
}

export async function syncProductosFromDistribuidora(): Promise<SyncResult> {
  const startedAt = new Date();
  const base = process.env.DISTRIBUIDORA_API_URL;

  if (!base) {
    const error = "DISTRIBUIDORA_API_URL no esta configurada";
    await logSync("error", 0, 0, 0, startedAt, error);
    return { estado: "error", productosCreados: 0, productosActualizados: 0, productosTotal: 0, error };
  }

  // 1. Traer catalogo remoto
  let remote: DistribuidoraProduct[];
  try {
    const url = `${base.replace(/\/$/, "")}/api/public/productos`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    remote = Array.isArray(json?.products) ? json.products : [];
  } catch (e) {
    const error = `No se pudo traer el catalogo: ${e instanceof Error ? e.message : String(e)}`;
    await logSync("error", 0, 0, 0, startedAt, error);
    return { estado: "error", productosCreados: 0, productosActualizados: 0, productosTotal: 0, error };
  }

  // 2. ids existentes (para distinguir creados vs actualizados)
  const existing = new Set<string>();
  {
    const { data } = await supabaseAdmin.from("productos").select("id");
    for (const r of data ?? []) existing.add(r.id);
  }

  // 3. Mapear SOLO campos del catalogo. Nunca stock / stock_minimo / precio_base.
  const nowIso = new Date().toISOString();
  const rows = remote
    .filter((p) => p && p.id)
    .map((p) => ({
      id: p.id,
      codigo: deriveCodigo(p.id, p.codigo),
      codigo_barras: p.codigoBarras ?? null,
      name: p.name ?? "",
      description: p.description ?? "",
      price: Number(p.price) || 0,
      category: p.category ?? "",
      image_url: p.imageUrl ?? "",
      disabled: p.disabled ?? false,
      synced_at: nowIso,
    }));

  let creados = 0;
  let actualizados = 0;
  for (const r of rows) {
    if (existing.has(r.id)) actualizados++;
    else creados++;
  }

  // 4. Upsert por lotes (onConflict id — solo actualiza columnas provistas)
  const CHUNK = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("productos").upsert(slice, { onConflict: "id" });
      if (error) throw error;
    }
  } catch (e) {
    const error = `Error guardando productos: ${e instanceof Error ? e.message : String(e)}`;
    await logSync("parcial", creados, actualizados, rows.length, startedAt, error);
    return { estado: "parcial", productosCreados: creados, productosActualizados: actualizados, productosTotal: rows.length, error };
  }

  await logSync("ok", creados, actualizados, rows.length, startedAt);
  return { estado: "ok", productosCreados: creados, productosActualizados: actualizados, productosTotal: rows.length };
}
