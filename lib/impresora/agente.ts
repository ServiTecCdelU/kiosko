// lib/impresora/agente.ts — cliente del agente local de impresion
// (herramientas/agente-impresora/agente.js), que corre en la PC del mostrador
// y escribe en la impresora de Windows o en una impresora de red.

export interface EstadoAgente {
  ok: boolean;
  version: string;
  impresoras: string[];
}

function base64De(datos: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < datos.length; i += 0x8000) {
    bin += String.fromCharCode(...datos.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function normalizarUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function errorConexion(url: string): Error {
  return new Error(`No responde el agente de impresión en ${url}. ¿Está abierto en esta PC?`);
}

export async function estadoAgente(url: string): Promise<EstadoAgente> {
  const base = normalizarUrl(url);
  let res: Response;
  try {
    res = await fetch(`${base}/estado`, { signal: AbortSignal.timeout(4000) });
  } catch {
    throw errorConexion(base);
  }
  if (!res.ok) throw new Error(`El agente respondió ${res.status}`);
  const data = (await res.json()) as Partial<EstadoAgente>;
  return { ok: !!data.ok, version: String(data.version ?? ""), impresoras: Array.isArray(data.impresoras) ? data.impresoras.map(String) : [] };
}

export async function enviarAlAgente(url: string, impresora: string, datos: Uint8Array): Promise<void> {
  const base = normalizarUrl(url);
  let res: Response;
  try {
    res = await fetch(`${base}/imprimir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ impresora: impresora.trim(), datos: base64De(datos) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw errorConexion(base);
  }
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `El agente respondió ${res.status}` }));
    throw new Error(error ?? "El agente no pudo imprimir");
  }
}
