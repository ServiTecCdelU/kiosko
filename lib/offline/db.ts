// lib/offline/db.ts — IndexedDB: catalogo cacheado + cola de ventas pendientes de sincronizar.
// Sin librerias externas: IndexedDB nativo del navegador.
import type { Product } from "@/lib/types";
import type { CreateSaleInput } from "@/services/sales-service";
import type { VentaPendiente } from "@/lib/offline/cola";
import { claveDelComercioActual } from "@/lib/clave-comercio";

export type { VentaPendiente };

const DB_NAME = "kiosko-offline";
const DB_VERSION = 1;
const STORE_PRODUCTOS = "productos";
const STORE_VENTAS = "ventas_pendientes";

/**
 * Base offline DEL COMERCIO de la sesion ("kiosko-offline:<comercioId>"). SaaS:
 * en la misma PC, el catalogo y la cola de ventas de un comercio nunca se
 * mezclan con los de otro. Sin sesion no hay base (ver isSupported).
 */
function nombreDb(): string | null {
  return claveDelComercioActual(DB_NAME);
}

function abrir(nombre: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(nombre, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTOS)) {
        db.createObjectStore(STORE_PRODUCTOS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_VENTAS)) {
        db.createObjectStore(STORE_VENTAS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Antes habia UNA base para todos ("kiosko-offline"). Sus ventas pendientes se
 * pasan a la base del comercio que entra (una sola vez) y la vieja se borra.
 * Si no eran de este comercio, el servidor las rechaza al sincronizar (valida
 * producto, caja y cliente) y quedan en "Ventas sin conexion": nunca se pierden
 * ni se registran en el comercio equivocado.
 */
async function migrarBaseCompartida(destino: IDBDatabase): Promise<void> {
  try {
    if (typeof indexedDB.databases === "function") {
      const existe = (await indexedDB.databases()).some((d) => d.name === DB_NAME);
      if (!existe) return;
    }
    const vieja = await abrir(DB_NAME);
    const ventas = await new Promise<VentaPendiente[]>((ok) => {
      if (!vieja.objectStoreNames.contains(STORE_VENTAS)) return ok([]);
      const q = vieja.transaction(STORE_VENTAS, "readonly").objectStore(STORE_VENTAS).getAll();
      q.onsuccess = () => ok(q.result as VentaPendiente[]);
      q.onerror = () => ok([]);
    });
    vieja.close();
    if (ventas.length) {
      await new Promise<void>((ok, mal) => {
        const tx = destino.transaction(STORE_VENTAS, "readwrite");
        for (const v of ventas) tx.objectStore(STORE_VENTAS).put(v);
        tx.oncomplete = () => ok();
        tx.onerror = () => mal(tx.error);
      });
    }
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // si falla, se reintenta la proxima vez (la vieja sigue ahi)
  }
}

let migracion: Promise<void> | null = null;

async function openDb(): Promise<IDBDatabase> {
  const nombre = nombreDb();
  if (!nombre) throw new Error("Sin sesion de comercio");
  const db = await abrir(nombre);
  migracion ??= migrarBaseCompartida(db);
  await migracion;
  return db;
}

function isSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && !!nombreDb();
}

export async function guardarCatalogoOffline(products: Product[]): Promise<void> {
  if (!isSupported()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, "readwrite");
    tx.objectStore(STORE_PRODUCTOS).clear();
    for (const p of products) tx.objectStore(STORE_PRODUCTOS).put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCatalogoOffline(): Promise<Product[]> {
  if (!isSupported()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, "readonly");
    const req = tx.objectStore(STORE_PRODUCTOS).getAll();
    req.onsuccess = () => resolve(req.result as Product[]);
    req.onerror = () => reject(req.error);
  });
}

/** Actualiza el stock cacheado localmente tras una venta offline (optimista, se corrige al sincronizar). */
export async function descontarStockOffline(productId: string, cantidad: number): Promise<void> {
  if (!isSupported()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PRODUCTOS, "readwrite");
    const store = tx.objectStore(STORE_PRODUCTOS);
    const req = store.get(productId);
    req.onsuccess = () => {
      const p = req.result as Product | undefined;
      if (p && p.stockControlado) {
        store.put({ ...p, stock: Math.max(0, p.stock - cantidad) });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function encolarVentaPendiente(input: CreateSaleInput): Promise<VentaPendiente> {
  const venta: VentaPendiente = { id: crypto.randomUUID(), input, createdAt: new Date().toISOString() };
  // Nunca devolver la venta como "guardada" si no se pudo guardar: el POS la
  // daria por cobrada y no quedaria en ningun lado.
  if (!isSupported()) throw new Error("No se pudo guardar la venta sin conexión en este navegador");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, "readwrite");
    tx.objectStore(STORE_VENTAS).put(venta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return venta;
}

export async function listarVentasPendientes(): Promise<VentaPendiente[]> {
  if (!isSupported()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, "readonly");
    const req = tx.objectStore(STORE_VENTAS).getAll();
    req.onsuccess = () => resolve((req.result as VentaPendiente[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

/** Cambia una venta de la cola (marcar el rechazo, pasarla a otra caja). */
export async function actualizarVentaPendiente(id: string, cambios: Partial<Omit<VentaPendiente, "id">>): Promise<void> {
  if (!isSupported()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, "readwrite");
    const store = tx.objectStore(STORE_VENTAS);
    const req = store.get(id);
    req.onsuccess = () => {
      const v = req.result as VentaPendiente | undefined;
      if (v) store.put({ ...v, ...cambios, input: { ...v.input, ...(cambios.input ?? {}) } });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function marcarVentaConError(id: string, motivo: string): Promise<void> {
  const v = (await listarVentasPendientes()).find((x) => x.id === id);
  await actualizarVentaPendiente(id, { error: motivo, intentos: (v?.intentos ?? 0) + 1 });
}

export async function quitarVentaPendiente(id: string): Promise<void> {
  if (!isSupported()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_VENTAS, "readwrite");
    tx.objectStore(STORE_VENTAS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
