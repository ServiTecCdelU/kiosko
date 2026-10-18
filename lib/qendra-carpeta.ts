// lib/qendra-carpeta.ts — guarda el archivo de productos en la carpeta que vigila Qendra.
//
// Chrome y Edge (File System Access): el dueño elige la carpeta una vez y desde ahi
// "Enviar a la balanza" sobrescribe el archivo; Qendra lo importa solo (si esta
// configurado para revisar la carpeta) y lo transmite a las Cuora. La carpeta se
// recuerda por PC y por comercio en IndexedDB (un "handle" no entra en localStorage).
// Sin esa API, se descarga el archivo y se copia a mano.
import { claveDelComercioActual } from "@/lib/clave-comercio";

export const NOMBRE_ARCHIVO_QENDRA = "productos.csv";

// Tipos minimos de File System Access (no estan en lib.dom de TypeScript).
interface Escritura { write(data: BufferSource | Blob): Promise<void>; close(): Promise<void> }
interface ArchivoHandle { createWritable(): Promise<Escritura> }
interface CarpetaHandle {
  name: string;
  getFileHandle(nombre: string, opts: { create: boolean }): Promise<ArchivoHandle>;
  queryPermission?(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "readwrite" }): Promise<PermissionState>;
}

export function soportaCarpeta(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && "indexedDB" in window;
}

const DB = "kiosko-qendra";
const STORE = "carpetas";

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(modo: IDBTransactionMode, accion: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrirDb();
  return new Promise<T>((resolve, reject) => {
    const req = accion(db.transaction(STORE, modo).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

function clave(): string | null {
  return claveDelComercioActual("qendra:carpeta");
}

/** La carpeta elegida antes en esta PC (o null). */
export async function carpetaGuardada(): Promise<CarpetaHandle | null> {
  const k = clave();
  if (!k || !soportaCarpeta()) return null;
  try {
    return (await idb<CarpetaHandle | undefined>("readonly", (s) => s.get(k))) ?? null;
  } catch {
    return null;
  }
}

/** Abre el selector de carpetas. null si el usuario cancelo. */
export async function elegirCarpeta(): Promise<CarpetaHandle | null> {
  const k = clave();
  if (!k) throw new Error("Falta la sesión del comercio");
  try {
    const handle = await (window as unknown as {
      showDirectoryPicker(opts: { id: string; mode: "readwrite" }): Promise<CarpetaHandle>;
    }).showDirectoryPicker({ id: "qendra", mode: "readwrite" });
    await idb("readwrite", (s) => s.put(handle, k));
    return handle;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/**
 * Escribe (sobrescribe) productos.csv en la carpeta. Despues de reiniciar el
 * navegador Chrome vuelve a pedir permiso: por eso se llama desde un clic.
 */
export async function escribirEnCarpeta(carpeta: CarpetaHandle, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const permiso = (await carpeta.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (permiso !== "granted" && (await carpeta.requestPermission?.({ mode: "readwrite" })) !== "granted") {
    throw new Error("Sin permiso para escribir en la carpeta de Qendra");
  }
  const archivo = await carpeta.getFileHandle(NOMBRE_ARCHIVO_QENDRA, { create: true });
  const w = await archivo.createWritable();
  await w.write(bytes);
  await w.close();
}
