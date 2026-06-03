// services/products-service.ts — lectura del catalogo (client, anon)
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

function mapRow(d: Record<string, any>): Product {
  return {
    id: d.id,
    codigo: d.codigo ?? undefined,
    codigoBarras: d.codigo_barras ?? undefined,
    name: d.name ?? "",
    description: d.description ?? "",
    price: Number(d.price) || 0,
    precioBase: d.precio_base != null ? Number(d.precio_base) : undefined,
    category: d.category ?? "",
    imageUrl: d.image_url ?? "",
    stock: Number(d.stock) || 0,
    stockMinimo: Number(d.stock_minimo) || 0,
    disabled: d.disabled ?? false,
    syncedAt: d.synced_at ? new Date(d.synced_at) : undefined,
    createdAt: d.created_at ? new Date(d.created_at) : new Date(),
    updatedAt: d.updated_at ? new Date(d.updated_at) : new Date(),
  };
}

// Quita caracteres que rompen el filtro .or() de PostgREST
function sanitize(q: string): string {
  return q.replace(/[,()%]/g, " ").trim();
}

export async function searchProducts(query: string, limit = 24): Promise<Product[]> {
  const q = sanitize(query);
  if (!q) return [];
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .eq("disabled", false)
    .or(`name.ilike.%${q}%,codigo.ilike.%${q}%,codigo_barras.ilike.%${q}%`)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

// Lookup exacto para el lector de codigo de barras: prueba codigo_barras y luego codigo
export async function findProductByCode(code: string): Promise<Product | null> {
  const c = code.trim();
  if (!c) return null;

  const byBarcode = await supabase
    .from("productos")
    .select("*")
    .eq("codigo_barras", c)
    .eq("disabled", false)
    .limit(1)
    .maybeSingle();
  if (byBarcode.data) return mapRow(byBarcode.data);

  const byCodigo = await supabase
    .from("productos")
    .select("*")
    .eq("codigo", c)
    .eq("disabled", false)
    .limit(1)
    .maybeSingle();
  if (byCodigo.data) return mapRow(byCodigo.data);

  return null;
}
