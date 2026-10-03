// lib/sync-filas.ts — catalogo de la distribuidora -> filas de productos DE UN COMERCIO.
//
// SaaS: cada comercio que sincroniza tiene SU copia del catalogo. El id de la
// fila lleva el comercio adelante (`${comercioId}__${distId}`), asi dos kioscos
// con el mismo catalogo nunca comparten (ni se pisan) un producto. comercio_1
// conserva los ids viejos (id == dist_id) para no duplicar su catalogo.
// Solo campos del catalogo: NUNCA stock, stock_minimo ni costo (son del kiosko).

export const COMERCIO_LEGACY = "comercio_1";

export interface ProductoDistribuidora {
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

export function idProductoSync(comercioId: string, distId: string): string {
  return comercioId === COMERCIO_LEGACY ? distId : `${comercioId}__${distId}`;
}

/** prod_mp_123 -> 123 · prod_456 -> 456 (cuando la distribuidora no manda el codigo). */
export function derivarCodigo(id: string, explicito?: string): string | null {
  if (explicito) return explicito;
  if (!id) return null;
  const mp = id.match(/^prod_mp_(.+)$/);
  if (mp) return mp[1];
  const p = id.match(/^prod_(.+)$/);
  if (p) return p[1];
  return null;
}

export function filasDesdeDistribuidora(remoto: ProductoDistribuidora[], comercioId: string, ahoraIso: string) {
  if (!comercioId) throw new Error("Falta el comercio de la sincronizacion");
  return remoto
    .filter((p) => p && p.id)
    .map((p) => ({
      id: idProductoSync(comercioId, p.id),
      comercio_id: comercioId,
      dist_id: p.id,
      codigo: derivarCodigo(p.id, p.codigo),
      codigo_barras: p.codigoBarras ?? null,
      name: p.name ?? "",
      description: p.description ?? "",
      price: Number(p.price) || 0,
      category: p.category ?? "",
      image_url: p.imageUrl ?? "",
      disabled: p.disabled ?? false,
      synced_at: ahoraIso,
    }));
}
