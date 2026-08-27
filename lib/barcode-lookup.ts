// lib/barcode-lookup.ts — autocompleta el nombre de un producto nuevo probando varias
// bases de datos publicas de codigos de barra, en cadena, hasta encontrar una coincidencia.

async function buscarEnOpenFactsAPI(dominio: string, codigo: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://${dominio}/api/v2/product/${encodeURIComponent(codigo)}.json`, {
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

async function buscarEnUpcItemDb(codigo: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(codigo)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const nombre = data?.items?.[0]?.title;
    return nombre ? String(nombre).trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Prueba varias fuentes gratuitas en orden hasta encontrar el nombre del producto. */
export async function lookupNombrePorCodigoBarras(codigo: string): Promise<string | undefined> {
  const fuentes = [
    () => buscarEnOpenFactsAPI("world.openfoodfacts.org", codigo),
    () => buscarEnOpenFactsAPI("world.openproductsfacts.org", codigo),
    () => buscarEnOpenFactsAPI("world.openbeautyfacts.org", codigo),
    () => buscarEnUpcItemDb(codigo),
  ];
  for (const fuente of fuentes) {
    const nombre = await fuente();
    if (nombre) return nombre;
  }
  return undefined;
}
