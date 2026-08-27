// services/products-service.ts — lectura del catalogo (client, anon)
import { consultar } from "@/services/api-client";
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
    favorito: d.favorito ?? false,
    fechaVencimiento: d.fecha_vencimiento ? new Date(d.fecha_vencimiento) : undefined,
    unidad: d.unidad === "kg" ? "kg" : "un",
    stockControlado: d.stock_controlado ?? true,
    disabled: d.disabled ?? false,
    ofertaActiva: d.oferta_activa ?? false,
    ofertaTipo: d.oferta_tipo ?? undefined,
    ofertaValor: Number(d.oferta_valor) || 0,
    ofertaCantidad: d.oferta_cantidad != null ? Number(d.oferta_cantidad) : undefined,
    syncedAt: d.synced_at ? new Date(d.synced_at) : undefined,
    createdAt: d.created_at ? new Date(d.created_at) : new Date(),
    updatedAt: d.updated_at ? new Date(d.updated_at) : new Date(),
  };
}

// Quita caracteres que rompen el filtro .or() de PostgREST

export async function searchProducts(query: string, limit = 24): Promise<Product[]> {
  const { productos } = await consultar<{ productos: Record<string, any>[] }>(
    "/api/consultas/productos", "buscar", { query, limit },
  );
  return productos.map(mapRow);
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


export async function getProductsPage(params: ProductsPageParams): Promise<ProductsPageResult> {
  const { productos, total } = await consultar<{ productos: Record<string, any>[]; total: number }>(
    "/api/consultas/productos", "pagina", { params },
  );
  return { products: productos.map(mapRow), total };
}

export interface StockStats {
  total: number;
  stockBajo: number;
  agotados: number;
  revisar: number;
}

/** Trae id/stock/stock_minimo/revisar de todo el catalogo activo para calcular las tarjetas del dashboard. */
export async function getStockStats(): Promise<StockStats> {
  return consultar<StockStats>("/api/consultas/productos", "stats");
}

export async function getCategorias(): Promise<string[]> {
  const { categorias } = await consultar<{ categorias: string[] }>("/api/consultas/productos", "categorias");
  return categorias;
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
  favorito: boolean;
  fechaVencimiento?: string; // YYYY-MM-DD
  unidad: "un" | "kg";
  stockControlado: boolean;
}

export async function updateProduct(productId: string, input: UpdateProductInput): Promise<void> {
  const res = await fetch("/api/productos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo actualizar el producto");
  }
}

export interface CambioPrecio {
  id: string;
  campo: string;
  valorAnterior: string;
  valorNuevo: string;
  usuarioNombre?: string;
  fecha: Date;
}

export async function logCambioPrecio(
  productId: string,
  campo: string,
  valorAnterior: number,
  valorNuevo: number,
  usuarioNombre?: string,
): Promise<void> {
  const res = await fetch("/api/productos/auditoria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId, campo, valorAnterior, valorNuevo, usuarioNombre,
      comercioId: getComercioId(),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo registrar el cambio de precio");
  }
}

export async function getHistorialPrecio(productId: string, limit = 10): Promise<CambioPrecio[]> {
  const { cambios } = await consultar<{ cambios: Record<string, any>[] }>(
    "/api/consultas/productos", "historialPrecio", { productId, limit },
  );
  return cambios.map((d) => ({
    id: d.id,
    campo: d.campo,
    valorAnterior: d.valor_anterior ?? "",
    valorNuevo: d.valor_nuevo ?? "",
    usuarioNombre: d.usuario_nombre ?? undefined,
    fecha: new Date(d.fecha),
  }));
}

/** Catalogo completo activo, para cachear en IndexedDB y poder vender sin conexion. */

export async function getCatalogoCompleto(): Promise<Product[]> {
  const { productos } = await consultar<{ productos: Record<string, any>[] }>("/api/consultas/productos", "catalogo");
  return productos.map(mapRow);
}

export interface AumentoPrecio {
  productoId: string;
  nombre: string;
  precioAnterior: number;
  precioNuevo: number;
  variacionPct: number;
  usuarioNombre?: string;
  fecha: Date;
}

/** Mayores subas de precio en los ultimos N dias, cruzando todo el catalogo. */
export async function getMayoresAumentos(dias = 30, limit = 15): Promise<AumentoPrecio[]> {
  const { aumentos } = await consultar<{ aumentos: (Omit<AumentoPrecio, "fecha"> & { fecha: string })[] }>(
    "/api/consultas/productos", "mayoresAumentos", { dias, limit },
  );
  return aumentos.map((a) => ({ ...a, fecha: new Date(a.fecha) }));
}

export async function getFavoritos(): Promise<Product[]> {
  const { productos } = await consultar<{ productos: Record<string, any>[] }>("/api/consultas/productos", "favoritos");
  return productos.map(mapRow);
}

export async function getVencimientosProximos(dias = 7): Promise<Product[]> {
  const { productos } = await consultar<{ productos: Record<string, any>[] }>(
    "/api/consultas/productos", "vencimientos", { dias },
  );
  return productos.map(mapRow);
}

export interface SetOfertaInput {
  activa: boolean;
  tipo?: OfertaTipo;
  valor?: number;
  cantidad?: number;
}

/** Marca/actualiza la oferta de catálogo de un producto (descuento propio, incluye combos). */
export async function setOferta(productId: string, oferta: SetOfertaInput): Promise<void> {
  const res = await fetch("/api/productos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, oferta, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo actualizar la oferta");
  }
}

export interface CreateProductInput {
  name: string;
  price: number;
  stock: number;
  codigoBarras?: string;
  category?: string;
}

export async function createProduct(input: CreateProductInput): Promise<string> {
  const res = await fetch("/api/productos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo crear el producto");
  }
  const data = await res.json();
  return data.id as string;
}

export async function findProductByCode(code: string): Promise<Product | null> {
  const c = code.trim();
  if (!c) return null;
  const { producto } = await consultar<{ producto: Record<string, any> | null }>(
    "/api/consultas/productos", "porCodigo", { code: c },
  );
  return producto ? mapRow(producto) : null;
}
