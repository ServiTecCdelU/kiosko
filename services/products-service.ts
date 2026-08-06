// services/products-service.ts — lectura del catalogo (client, anon)
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";
import type { OfertaTipo, Product } from "@/lib/types";

export function mapRow(d: Record<string, any>): Product {
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
    lote: d.lote != null ? Number(d.lote) : undefined,
    revisar: d.revisar ?? false,
    disabled: d.disabled ?? false,
    ofertaActiva: d.oferta_activa ?? false,
    ofertaTipo: d.oferta_tipo ?? undefined,
    ofertaValor: Number(d.oferta_valor) || 0,
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
    .eq("comercio_id", getComercioId())
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
  const comercioId = getComercioId();

  // Stock bajo: PostgREST no compara dos columnas, se trae un set amplio y se filtra aca.
  if (params.soloStockBajo) {
    let q = supabase.from("productos").select("*").eq("comercio_id", comercioId).eq("disabled", false);
    if (s) q = q.or(`name.ilike.%${s}%,codigo.ilike.%${s}%,codigo_barras.ilike.%${s}%`);
    const { data, error } = await q.order("stock", { ascending: true }).limit(1000);
    if (error) throw new Error(error.message);
    const products = (data ?? []).map(mapRow).filter((p) => p.stock <= p.stockMinimo);
    return { products, total: products.length };
  }

  const page = params.page ?? 0;
  const size = params.pageSize ?? 30;
  let q = supabase.from("productos").select("*", { count: "exact" }).eq("comercio_id", comercioId).eq("disabled", false);
  if (s) q = q.or(`name.ilike.%${s}%,codigo.ilike.%${s}%,codigo_barras.ilike.%${s}%`);
  const { data, count, error } = await q
    .order("name", { ascending: true })
    .range(page * size, page * size + size - 1);
  if (error) throw new Error(error.message);
  return { products: (data ?? []).map(mapRow), total: count ?? 0 };
}

export interface SetOfertaInput {
  activa: boolean;
  tipo?: OfertaTipo;
  valor?: number;
}

/** Marca/actualiza la oferta de catálogo de un producto (descuento propio). */
export async function setOferta(productId: string, oferta: SetOfertaInput): Promise<void> {
  const { error } = await supabase
    .from("productos")
    .update({
      oferta_activa: oferta.activa,
      oferta_tipo: oferta.activa ? oferta.tipo ?? null : null,
      oferta_valor: oferta.activa ? oferta.valor ?? 0 : 0,
    })
    .eq("comercio_id", getComercioId())
    .eq("id", productId);
  if (error) throw new Error(error.message);
}

// Lookup exacto para el lector de codigo de barras: prueba codigo_barras y luego codigo
export async function findProductByCode(code: string): Promise<Product | null> {
  const c = code.trim();
  if (!c) return null;
  const comercioId = getComercioId();

  const byBarcode = await supabase
    .from("productos")
    .select("*")
    .eq("comercio_id", comercioId)
    .eq("codigo_barras", c)
    .eq("disabled", false)
    .limit(1)
    .maybeSingle();
  if (byBarcode.data) return mapRow(byBarcode.data);

  const byCodigo = await supabase
    .from("productos")
    .select("*")
    .eq("comercio_id", comercioId)
    .eq("codigo", c)
    .eq("disabled", false)
    .limit(1)
    .maybeSingle();
  if (byCodigo.data) return mapRow(byCodigo.data);

  return null;
}
