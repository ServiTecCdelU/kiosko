// lib/barcode-lookup.ts — autocompleta el nombre de un producto nuevo consultando Open Food Facts.
export async function lookupNombrePorCodigoBarras(codigo: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data?.status !== 1) return undefined;
    const nombre = data.product?.product_name || data.product?.product_name_es;
    return nombre ? String(nombre).trim() : undefined;
  } catch {
    return undefined;
  }
}
