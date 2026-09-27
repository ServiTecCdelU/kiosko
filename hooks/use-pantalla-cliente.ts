"use client";
// hooks/use-pantalla-cliente.ts — el POS le cuenta a la pantalla del cliente
// (/pantalla-cliente, otra ventana en la misma PC, tipicamente un 2do monitor)
// que hay en el carrito, via BroadcastChannel. Sin red ni base: si la pantalla
// no esta abierta, los mensajes se pierden sin costo.
import { useCallback, useEffect, useRef } from "react";
import { precioLinea } from "@/lib/pricing";
import { ahorroLinea, etiquetaOferta } from "@/lib/oferta-analisis";
import type { CartItem } from "@/lib/types";

export const CANAL_PANTALLA = "kiosko-pantalla-cliente";

export interface LineaPantalla {
  id: string;
  nombre: string;
  cantidad: number;
  unidad: "un" | "kg";
  subtotal: number;
  ahorro: number;
  etiqueta: string | null;
}

export type MensajePantalla =
  | { tipo: "carrito"; lineas: LineaPantalla[]; total: number; ahorro: number }
  | { tipo: "gracias"; total: number; ahorro: number }
  /** La pantalla recien abierta pide el estado actual. */
  | { tipo: "hola" };

export function abrirCanalPantalla(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_PANTALLA);
}

function mensajeCarrito(items: CartItem[]): MensajePantalla {
  const lineas = items.map((i) => ({
    id: i.product.id,
    nombre: i.product.name,
    cantidad: i.quantity,
    unidad: i.product.unidad,
    subtotal: precioLinea(i.product, i.quantity),
    ahorro: ahorroLinea(i.product, i.quantity),
    etiqueta: etiquetaOferta(i.product),
  }));
  return {
    tipo: "carrito",
    lineas,
    total: lineas.reduce((s, l) => s + l.subtotal, 0),
    ahorro: lineas.reduce((s, l) => s + l.ahorro, 0),
  };
}

/** Lo usa el POS: publica cada cambio del carrito y devuelve como anunciar una venta cerrada. */
export function usePantallaCliente(items: CartItem[]): (total: number, ahorro: number) => void {
  const canal = useRef<BroadcastChannel | null>(null);
  const ultimo = useRef<MensajePantalla>({ tipo: "carrito", lineas: [], total: 0, ahorro: 0 });

  useEffect(() => {
    const c = abrirCanalPantalla();
    if (!c) return;
    canal.current = c;
    c.onmessage = (e: MessageEvent<MensajePantalla>) => {
      if (e.data?.tipo === "hola") c.postMessage(ultimo.current);
    };
    return () => {
      c.close();
      canal.current = null;
    };
  }, []);

  useEffect(() => {
    ultimo.current = mensajeCarrito(items);
    canal.current?.postMessage(ultimo.current);
  }, [items]);

  return useCallback((total: number, ahorro: number) => {
    canal.current?.postMessage({ tipo: "gracias", total, ahorro } satisfies MensajePantalla);
  }, []);
}
