// lib/offline/catalog.ts — busqueda sobre el catalogo cacheado en IndexedDB, para cuando no hay red.
import { getCatalogoOffline } from "@/lib/offline/db";
import type { Product } from "@/lib/types";
import { coincideBusqueda, palabrasBusqueda } from "@/lib/busqueda";

export async function buscarProductosOffline(query: string, limit = 24): Promise<Product[]> {
  // Mismas reglas que el servidor: cada palabra, sin tildes (lib/busqueda.ts).
  const palabras = palabrasBusqueda(query);
  if (palabras.length === 0) return [];
  const productos = await getCatalogoOffline();
  return productos
    .filter((p) =>
      !p.disabled &&
      coincideBusqueda(`${p.name} ${p.codigo ?? ""} ${p.codigoBarras ?? ""} ${p.description ?? ""}`, palabras),
    )
    .slice(0, limit);
}

export async function buscarPorCodigoOffline(code: string): Promise<Product | null> {
  const c = code.trim();
  if (!c) return null;
  const productos = await getCatalogoOffline();
  return (
    productos.find((p) => !p.disabled && p.codigoBarras === c) ??
    productos.find((p) => !p.disabled && p.codigo === c) ??
    null
  );
}

export async function getFavoritosOffline(): Promise<Product[]> {
  const productos = await getCatalogoOffline();
  return productos.filter((p) => !p.disabled && p.favorito).slice(0, 60);
}
