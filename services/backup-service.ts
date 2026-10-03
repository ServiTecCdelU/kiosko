// services/backup-service.ts — descarga del Excel con todos los datos de un comercio.
import { apiUrl } from "@/lib/utils/api-url";
import { descargarBlob } from "@/lib/utils/descargar";

async function descargar(ruta: string): Promise<void> {
  const res = await fetch(apiUrl(ruta));
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo descargar el backup");
  }
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "backup.xlsx";
  descargarBlob(await res.blob(), nombre);
}

/** El admin baja los datos de su propio comercio. */
export function descargarMiBackup(): Promise<void> {
  return descargar("/api/backup");
}

/** El superadmin baja los datos de cualquier comercio. */
export function descargarBackupDeComercio(comercioId: string): Promise<void> {
  return descargar(`/api/superadmin/backup?id=${encodeURIComponent(comercioId)}`);
}
