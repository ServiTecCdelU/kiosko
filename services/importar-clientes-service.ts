// services/importar-clientes-service.ts — manda los clientes parseados en el
// navegador (lib/importar-filas.ts) a /api/clientes/importar por lotes.
import { apiUrl } from "@/lib/utils/api-url";
import type { ClienteFila } from "@/lib/importar-filas";

export type EstrategiaClientes = "solo_nuevos" | "actualizar";

export interface ResumenClientes {
  creados: number;
  actualizados: number;
  omitidos: number;
  conDeuda: number;
}

export async function importarClientes(
  filas: ClienteFila[],
  estrategia: EstrategiaClientes,
  onProgress?: (hecho: number, total: number) => void,
): Promise<ResumenClientes> {
  const resumen: ResumenClientes = { creados: 0, actualizados: 0, omitidos: 0, conDeuda: 0 };
  const TAMANIO_LOTE = 150;
  for (let i = 0; i < filas.length; i += TAMANIO_LOTE) {
    const lote = filas.slice(i, i + TAMANIO_LOTE).map((f) => ({
      nombre: f.nombre, telefono: f.telefono, documento: f.documento,
      limiteCredito: f.limiteCredito, saldo: f.saldo, notas: f.notas,
    }));
    const res = await fetch(apiUrl("/api/clientes/importar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filas: lote, estrategia }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "No se pudo importar");
    resumen.creados += data.creados ?? 0;
    resumen.actualizados += data.actualizados ?? 0;
    resumen.omitidos += data.omitidos ?? 0;
    resumen.conDeuda += data.conDeuda ?? 0;
    onProgress?.(Math.min(i + TAMANIO_LOTE, filas.length), filas.length);
  }
  return resumen;
}
