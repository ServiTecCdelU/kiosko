"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getCatalogoCompleto } from "@/services/products-service";
import { createSale, NetworkUnavailableError } from "@/services/sales-service";
import {
  guardarCatalogoOffline, listarVentasPendientes, quitarVentaPendiente,
  type VentaPendiente,
} from "@/lib/offline/db";

/**
 * Orquesta el modo offline del POS: cachea el catálogo cuando hay conexión y
 * reintenta las ventas que quedaron en cola cada vez que vuelve internet.
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const syncing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount((await listarVentasPendientes()).length);
  }, []);

  const syncCatalogo = useCallback(async () => {
    try {
      const productos = await getCatalogoCompleto();
      await guardarCatalogoOffline(productos);
    } catch {
      // sin conexion o error de red: se sigue usando el catalogo cacheado anterior
    }
  }, []);

  const syncVentasPendientes = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const pendientes: VentaPendiente[] = await listarVentasPendientes();
      let sincronizadas = 0;
      for (const venta of pendientes) {
        try {
          await createSale(venta.input);
          await quitarVentaPendiente(venta.id);
          sincronizadas++;
        } catch (e) {
          if (e instanceof NetworkUnavailableError) break; // se corto de nuevo, seguimos despues
          // error de validacion del server (ej: producto ya no existe): se descarta para no trabar la cola
          await quitarVentaPendiente(venta.id);
          toast.error(`No se pudo sincronizar una venta pendiente: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      if (sincronizadas > 0) toast.success(`${sincronizadas} venta(s) offline sincronizada(s)`);
      await refreshPendingCount();
    } finally {
      syncing.current = false;
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshPendingCount();
    if (navigator.onLine) syncCatalogo();

    const handleOnline = () => {
      setIsOnline(true);
      toast.info("Conexión recuperada, sincronizando...");
      syncCatalogo();
      syncVentasPendientes();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Sin conexión: las ventas se guardan y se sincronizan solas al volver el internet");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncCatalogo, syncVentasPendientes, refreshPendingCount]);

  return { isOnline, pendingCount, refreshPendingCount, syncVentasPendientes };
}
