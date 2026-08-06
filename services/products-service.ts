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
  soloAgotados?: boolean;
  soloRevisar?: boolean;
  categoria?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductsPageResult {
  products: Product[];
  total: number;
}

function applyCommonFilters(q: any, comercioId: string, s: string, categoria?: string) {
  let query = q.eq("comercio_id", comercioId).eq("disabled", false);
  if (s) query = query.or(`name.ilike.%${s}%,codigo.ilike.%${s}%,codigo_barras.ilike.%${s}%`);
  if (categoria) query = query.eq("category", categoria);
  return query;
}

export async function getProductsPage(params: ProductsPageParams): Promise<ProductsPageResult> {
  const s = params.search ? sanitize(params.search) : "";
  const comercioId = getComercioId();

  // Stock bajo / agotados: PostgREST no compara dos columnas, se trae un set amplio y se filtra aca.
  if (params.soloStockBajo || params.soloAgotados) {
    let q = applyCommonFilters(supabase.from("productos").select("*"), comercioId, s, params.categoria);
    if (params.soloRevisar) q = q.eq("revisar", true);
    const { data, error } = await q.order("stock", { ascending: true }).limit(1000);
    if (error) throw new Error(error.message);
    let products = (data ?? []).map(mapRow);
    products = params.soloAgotados
      ? products.filter((p) => p.stock <= 0)
      : products.filter((p) => p.stock <= p.stockMinimo);
    return { products, total: products.length };
  }

  const page = params.page ?? 0;
  const size = params.pageSize ?? 30;
  let q = applyCommonFilters(
    supabase.from("productos").select("*", { count: "exact" }),
    comercioId,
    s,
    params.categoria,
  );
  if (params.soloRevisar) q = q.eq("revisar", true);
  const { data, count, error } = await q
    .order("name", { ascending: true })
    .range(page * size, page * size + size - 1);
  if (error) throw new Error(error.message);
  return { products: (data ?? []).map(mapRow), total: count ?? 0 };
}

export interface StockStats {
  total: number;
  stockBajo: number;
  agotados: number;
  revisar: number;
}

/** Trae id/stock/stock_minimo/revisar de todo el catalogo activo para calcular las tarjetas del dashboard. */
export async function getStockStats(): Promise<StockStats> {
  const comercioId = getComercioId();
  const { data, error } = await supabase
    .from("productos")
    .select("stock, stock_minimo, revisar")
    .eq("comercio_id", comercioId)
    .eq("disabled", false)
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    total: rows.length,
    stockBajo: rows.filter((r) => Number(r.stock) > 0 && Number(r.stock) <= Number(r.stock_minimo)).length,
    agotados: rows.filter((r) => Number(r.stock) <= 0).length,
    revisar: rows.filter((r) => r.revisar).length,
  };
}

export async function getCategorias(): Promise<string[]> {
  const comercioId = getComercioId();
  const { data, error } = await supabase
    .from("productos")
    .select("category")
    .eq("comercio_id", comercioId)
    .eq("disabled", false)
    .not("category", "is", null)
    .neq("category", "")
    .limit(5000);
  if (error) throw new Error(error.message);
  const set = new Set((data ?? []).map((r) => String(r.category)).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export interface UpdateProductInput {
  codigo?: string;
  codigoBarras?: string;
  name: string;
  category: string;
  price: number;
  costo?: number;
  stockMinimo: number;
  lote?: number;
  disabled: boolean;
  revisar: boolean;
}

export async function updateProduct(productId: string, input: UpdateProductInput): Promise<void> {
  const { error } = await supabase
    .from("productos")
    .update({
      codigo: input.codigo || null,
      codigo_barras: input.codigoBarras || null,
      name: input.name,
      category: input.category,
      price: input.price,
      precio_base: input.costo ?? null,
      stock_minimo: input.stockMinimo,
      lote: input.lote ?? null,
      disabled: input.disabled,
      revisar: input.revisar,
    })
    .eq("comercio_id", getComercioId())
    .eq("id", productId);
  if (error) throw new Error(error.message);
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
