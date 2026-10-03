"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getCatalogoCompleto } from "@/services/products-service";
import { createSale } from "@/services/sales-service";
import {
  guardarCatalogoOffline, listarVentasPendientes, quitarVentaPendiente, marcarVentaConError,
  type VentaPendiente,
} from "@/lib/offline/db";
import { procesarCola } from "@/lib/offline/cola";
import { siEstaLibre } from "@/lib/offline/candado";

/** Mientras haya ventas en cola, se reintenta cada tanto aunque no haya evento "online". */
const REINTENTO_MS = 60_000;

/**
 * Orquesta el modo offline del POS: cachea el catalogo cuando hay conexion y
 * manda las ventas que quedaron en cola (lib/offline/cola.ts): al abrir, al
 * volver internet y cada minuto mientras queden. Una venta rechazada por el
 * servidor queda apartada para resolverla a mano: nunca se borra sola.
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendientes, setPendientes] = useState<VentaPendiente[]>([]);
  const syncing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendientes(await listarVentasPendientes().catch(() => []));
  }, []);

  const syncCatalogo = useCallback(async () => {
    try {
      const productos = await getCatalogoCompleto();
      await guardarCatalogoOffline(productos);
    } catch {
      // sin conexion o error de red: se sigue usando el catalogo cacheado anterior
    }
  }, []);

  const syncVentasPendientes = useCallback(async (avisarSiNoHay = false) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      // Si otra pestana (o un "Reintentar" manual) ya esta enviando, no se pisa.
      await siEstaLibre(async () => {
        const cola = await listarVentasPendientes();
        if (cola.length === 0) {
          if (avisarSiNoHay) toast.info("No hay ventas pendientes");
          return;
        }
        const r = await procesarCola(cola, {
          enviar: (v) => createSale(v.input),
          quitar: quitarVentaPendiente,
          marcarError: marcarVentaConError,
        });
        if (r.sincronizadas > 0) toast.success(`${r.sincronizadas} venta(s) sin conexión guardada(s)`);
        if (r.rechazadas > 0) toast.error(`${r.rechazadas} venta(s) sin conexión no se pudieron guardar: revisalas en "Ventas sin conexión"`);
        if (r.frenoPor === "retenida") toast.warning(`Hay ventas sin conexión esperando para guardarse: ${r.motivo}`);
      });
      await refreshPendingCount();
    } finally {
      syncing.current = false;
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshPendingCount();
    if (navigator.onLine) {
      syncCatalogo();
      // Ventas que quedaron de una sesion anterior sin internet.
      syncVentasPendientes();
    }

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

  // Reintento periodico: cubre cortes en los que el navegador sigue "online"
  // (el wifi anda pero no hay salida a internet) y no dispara el evento.
  const hayParaReintentar = pendientes.some((v) => !v.error);
  useEffect(() => {
    if (!hayParaReintentar) return;
    const t = setInterval(() => {
      if (navigator.onLine) syncVentasPendientes();
    }, REINTENTO_MS);
    return () => clearInterval(t);
  }, [hayParaReintentar, syncVentasPendientes]);

  return {
    isOnline,
    pendientes,
    pendingCount: pendientes.length,
    conError: pendientes.filter((v) => v.error).length,
    refreshPendingCount,
    syncVentasPendientes,
  };
}
