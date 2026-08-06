"use client";

import { useState, useCallback, useMemo } from "react";
import { precioFinal } from "@/lib/pricing";
import type { Product, CartItem } from "@/lib/types";

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  const addProduct = useCallback((product: Product, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { product, quantity: qty }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const min = i.product.unidad === "kg" ? 0.01 : 1;
        return { ...i, quantity: Math.max(min, qty) };
      }),
    );
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = useMemo(
    () => items.reduce((s, i) => s + precioFinal(i.product) * i.quantity, 0),
    [items],
  );

  const count = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items],
  );

  return { items, addProduct, setQuantity, removeProduct, clear, total, count };
}
