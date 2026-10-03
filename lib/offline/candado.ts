// lib/offline/candado.ts — un solo envio de ventas offline a la vez, entre todas
// las pestanas (Web Locks). Sin esto, la sincronizacion automatica y un
// "Reintentar" manual (o dos pestanas del POS) podian mandar la misma venta dos
// veces. Sin soporte de Web Locks corre igual (navegadores muy viejos).
const NOMBRE = "kiosko-sync-ventas";

type Locks = { request: (n: string, o: { ifAvailable?: boolean }, cb: (l: unknown) => Promise<void>) => Promise<void> };

function locks(): Locks | undefined {
  return typeof navigator !== "undefined" ? (navigator as unknown as { locks?: Locks }).locks : undefined;
}

/** Espera su turno y corre fn. */
export async function conCandado(fn: () => Promise<void>): Promise<void> {
  const l = locks();
  if (!l) return fn();
  await l.request(NOMBRE, {}, () => fn());
}

/** Corre fn solo si nadie mas esta enviando (la sincronizacion automatica no hace cola). */
export async function siEstaLibre(fn: () => Promise<void>): Promise<void> {
  const l = locks();
  if (!l) return fn();
  await l.request(NOMBRE, { ifAvailable: true }, async (lock) => {
    if (lock) await fn();
  });
}
