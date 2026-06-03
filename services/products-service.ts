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

export interface ProductsPageParams {
  search?: string;
  soloStockBajo?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductsPageResult {
  products: Product[];
  total: number;
}

export async function getProductsPage(params: ProductsPageParams): Promise<ProductsPageResult> {
  const s = params.search ? sanitize(params.search) : "";

  // Stock bajo: PostgREST no compara dos columnas, se trae un set amplio y se filtra aca.
  if (params.soloStockBajo) {
    let q = supabase.from("productos").select("*").eq("disabled", false);
    if (s) q = q.or(`name.ilike.%${s}%,codigo.ilike.%${s}%,codigo_barras.ilike.%${s}%`);
    const { data, error } = await q.order("stock", { ascending: true }).limit(1000);
    if (error) throw new Error(error.message);
    const products = (data ?? []).map(mapRow).filter((p) => p.stock <= p.stockMinimo);
    return { products, total: products.length };
  }

  const page = params.page ?? 0;
  const size = params.pageSize ?? 30;
  let q = supabase.from("productos").select("*", { count: "exact" }).eq("disabled", false);
  if (s) q = q.or(`name.ilike.%${s}%,codigo.ilike.%${s}%,codigo_barras.ilike.%${s}%`);
  const { data, count, error } = await q
    .order("name", { ascending: true })
    .range(page * size, page * size + size - 1);
  if (error) throw new Error(error.message);
  return { products: (data ?? []).map(mapRow), total: count ?? 0 };
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
