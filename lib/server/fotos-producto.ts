// lib/server/fotos-producto.ts — fotos de productos en Supabase Storage (server-only).
// Bucket publico "productos" (75_fotos_productos.sql). Ruta:
//   <comercio_id>/<producto_id>/<aleatorio>.<ext>       (subida por el dueño)
//   <comercio_id>/<producto_id>/off-<aleatorio>.<ext>   (copiada de Open Food Facts)
// El prefijo "off-" sirve para mostrar la atribucion en la tienda (licencia CC BY-SA).
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { nombreSugerido } from "@/lib/escaneo-stock";

export const BUCKET_FOTOS = "productos";
export const MAX_BYTES_FOTO = 2 * 1024 * 1024;
const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

export function esTipoFotoValido(mime: string): boolean {
  return mime in EXTENSION;
}

/** Ruta dentro del bucket si la URL es una foto nuestra; null si es de otro lado. */
function rutaPropia(url: string | null | undefined): string | null {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${BUCKET_FOTOS}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length)) : null;
}

/** El producto, solo si es del comercio. */
async function productoDelComercio(comercioId: string, productoId: string) {
  const { data, error } = await supabaseAdmin
    .from("productos").select("id, image_url").eq("comercio_id", comercioId).eq("id", productoId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El producto no existe");
  return data;
}

/**
 * Sube la foto, la deja en productos.image_url y borra la anterior (si era nuestra).
 * `origen` "off": copiada de Open Food Facts (lleva atribucion en la tienda).
 */
export async function guardarFotoProducto(
  comercioId: string,
  productoId: string,
  bytes: Uint8Array,
  mime: string,
  origen: "propia" | "off" = "propia",
): Promise<string> {
  if (!esTipoFotoValido(mime)) throw new Error("La foto tiene que ser JPG, PNG o WebP");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES_FOTO) throw new Error("La foto pesa más de 2 MB");
  const producto = await productoDelComercio(comercioId, productoId);

  const ruta = `${comercioId}/${productoId}/${origen === "off" ? "off-" : ""}${randomUUID()}.${EXTENSION[mime]}`;
  const { error: errorSubida } = await supabaseAdmin.storage
    .from(BUCKET_FOTOS)
    .upload(ruta, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (errorSubida) throw new Error(errorSubida.message);
  const url = supabaseAdmin.storage.from(BUCKET_FOTOS).getPublicUrl(ruta).data.publicUrl;

  const { error } = await supabaseAdmin
    .from("productos").update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("comercio_id", comercioId).eq("id", productoId);
  if (error) {
    await supabaseAdmin.storage.from(BUCKET_FOTOS).remove([ruta]);
    throw new Error(error.message);
  }
  await borrarArchivo(comercioId, producto.image_url);
  return url;
}

/** Saca la foto del producto (y el archivo, si era nuestro). */
export async function quitarFotoProducto(comercioId: string, productoId: string): Promise<void> {
  const producto = await productoDelComercio(comercioId, productoId);
  const { error } = await supabaseAdmin
    .from("productos").update({ image_url: "", updated_at: new Date().toISOString() })
    .eq("comercio_id", comercioId).eq("id", productoId);
  if (error) throw new Error(error.message);
  await borrarArchivo(comercioId, producto.image_url);
}

/** Solo borra archivos de la carpeta del propio comercio. */
async function borrarArchivo(comercioId: string, url: string | null | undefined): Promise<void> {
  const ruta = rutaPropia(url);
  if (!ruta || !ruta.startsWith(`${comercioId}/`)) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET_FOTOS).remove([ruta]);
  if (error) console.error("[fotos] no se pudo borrar la anterior:", error.message);
}

// ---- Open Food Facts: foto por codigo de barras (productos envasados) ----

const OFF_API = "https://world.openfoodfacts.org/api/v2/product";
// Open Food Facts pide identificar la app en el User-Agent.
const USER_AGENT = "MultiComercioPanel/1.0 (ServiTec; www.servitec.net.ar)";

/** URL de la foto de frente del producto en Open Food Facts, o null. */
export async function fotoOpenFoodFacts(ean: string): Promise<string | null> {
  if (!/^\d{8,14}$/.test(ean)) return null;
  const res = await fetch(`${OFF_API}/${ean}.json?fields=image_front_url,image_url`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const url = data?.product?.image_front_url || data?.product?.image_url;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/** Descarga la imagen de Open Food Facts (solo de su dominio) para copiarla a nuestro bucket. */
export async function descargarFotoOpenFoodFacts(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const host = new URL(url).hostname;
  if (!host.endsWith("openfoodfacts.org")) return null;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!esTipoFotoValido(mime)) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES_FOTO ? { bytes, mime } : null;
}

/** Nombre sugerido y foto de un codigo de barras en Open Food Facts (para el alta). */
export async function productoOpenFoodFacts(ean: string): Promise<{ nombre: string | null; foto: string | null } | null> {
  if (!/^\d{8,14}$/.test(ean)) return null;
  const res = await fetch(`${OFF_API}/${ean}.json?fields=product_name,product_name_es,brands,quantity,image_front_url`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const p = data?.product;
  if (!p) return null;
  const nombre = nombreSugerido({ product_name: p.product_name_es || p.product_name, brands: p.brands, quantity: p.quantity });
  const foto = typeof p.image_front_url === "string" && p.image_front_url.startsWith("https://") ? p.image_front_url : null;
  return nombre || foto ? { nombre, foto } : null;
}
