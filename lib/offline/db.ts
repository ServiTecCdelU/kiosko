// lib/offline/db.ts — IndexedDB: catalogo cacheado + cola de ventas pendientes de sincronizar.
// Sin librerias externas: IndexedDB nativo del navegador.
import type { Product } from "@/lib/types";
import type { CreateSaleInput } from "@/services/sales-service";

const DB_NAME = "kiosko-offline";
const DB_VERSION = 1;
const STORE_PRODUCTOS = "productos";
const STORE_VENTAS = "ventas_pendientes";

export interface VentaPendiente {
  id: string;
  input: CreateSaleInput;
  createdAt: string; // ISO
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

function isSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
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
  if (!isSupported()) return venta;
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
