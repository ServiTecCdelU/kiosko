"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { precioLinea } from "@/lib/pricing";
import { ajustarCantidad } from "@/lib/cantidad";
import { claveDelComercioActual } from "@/lib/clave-comercio";
import type { Product, CartItem } from "@/lib/types";

// El carrito sobrevive a salir del POS en la misma pestaña (ej: el aviso de
// "caja cerrada" manda a abrirla y antes se perdia lo cargado). sessionStorage:
// se borra al cerrar la pestaña. El precio igual lo recalcula el servidor al cobrar.
const CLAVE_CARRITO = "kiosko:carrito";

function leerCarrito(): CartItem[] {
  try {
    const clave = claveDelComercioActual(CLAVE_CARRITO);
    const crudo = clave ? window.sessionStorage.getItem(clave) : null;
    const items = crudo ? (JSON.parse(crudo) as CartItem[]) : [];
    return Array.isArray(items) ? items.filter((i) => i?.product?.id && Number(i.quantity) > 0) : [];
  } catch {
    return [];
  }
}

function guardarCarrito(items: CartItem[]): void {
  try {
    const clave = claveDelComercioActual(CLAVE_CARRITO);
    if (!clave) return;
    if (items.length === 0) window.sessionStorage.removeItem(clave);
    else window.sessionStorage.setItem(clave, JSON.stringify(items));
  } catch {
    // sin almacenamiento: el carrito vive solo mientras se esta en el POS
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  // Se lee despues de montar (no en el estado inicial) para no chocar con el HTML del servidor.
  const cargado = useRef(false);

  useEffect(() => {
    const guardado = leerCarrito();
    if (guardado.length > 0) setItems(guardado);
    cargado.current = true;
  }, []);

  useEffect(() => {
    if (cargado.current) guardarCarrito(items);
  }, [items]);

  const addProduct = useCallback((product: Product, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: ajustarCantidad(next[idx].quantity + qty, product.unidad) };
        return next;
      }
      return [...prev, { product, quantity: qty }];
    });
  }, []);

  /**
   * Producto a precio libre (recargas, "varios"): la linea lleva el importe como
   * precio y cantidad 1. Otro importe del mismo producto se suma a esa linea
   * (el carrito tiene una linea por producto).
   */
  const addPrecioLibre = useCallback((product: Product, importe: number) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        const linea = next[idx];
        const total = Math.round((linea.product.price * linea.quantity + importe) * 100) / 100;
        next[idx] = { product: { ...linea.product, price: total }, quantity: 1 };
        return next;
      }
      return [...prev, { product: { ...product, price: importe }, quantity: 1 }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        return { ...i, quantity: ajustarCantidad(qty, i.product.unidad) };
      }),
    );
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const replaceAll = useCallback((next: CartItem[]) => setItems(next), []);

  const total = useMemo(
    () => items.reduce((s, i) => s + precioLinea(i.product, i.quantity), 0),
    [items],
  );

  const count = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items],
  );

  return { items, addProduct, addPrecioLibre, setQuantity, removeProduct, clear, replaceAll, total, count };
}
