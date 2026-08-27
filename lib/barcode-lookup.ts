// lib/barcode-lookup.ts — autocompleta el nombre de un producto nuevo probando varias
// bases de datos publicas de codigos de barra en paralelo (para no sumar los tiempos).

const TIMEOUT_MS = 2500;

async function buscarEnOpenFactsAPI(dominio: string, codigo: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://${dominio}/api/v2/product/${encodeURIComponent(codigo)}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const nombre = data?.items?.[0]?.title;
    return nombre ? String(nombre).trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Prueba varias fuentes gratuitas en paralelo; da prioridad a Open Food Facts si varias responden. */
export async function lookupNombrePorCodigoBarras(codigo: string): Promise<string | undefined> {
  const fuentes = [
    buscarEnOpenFactsAPI("world.openfoodfacts.org", codigo),
    buscarEnOpenFactsAPI("world.openproductsfacts.org", codigo),
    buscarEnOpenFactsAPI("world.openbeautyfacts.org", codigo),
    buscarEnUpcItemDb(codigo),
  ];
  const resultados = await Promise.allSettled(fuentes);
  for (const r of resultados) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return undefined;
}
