"use client";
// hooks/use-ofertas-vigentes.ts — ofertas que se cobran hoy, recargadas cada
// 5 minutos, y un indice que rota solo. Para la pantalla de TV y la del cliente.
import { useCallback, useEffect, useState } from "react";
import { tieneOferta } from "@/lib/pricing";
import { getOfertas } from "@/services/products-service";
import type { Product } from "@/lib/types";

const RECARGA_MS = 5 * 60 * 1000;

/** null mientras carga la primera vez. */
export function useOfertasVigentes(): Product[] | null {
  const [ofertas, setOfertas] = useState<Product[] | null>(null);

  const cargar = useCallback(async () => {
    try {
      const todas = await getOfertas(false);
      setOfertas(todas.map((o) => o.producto).filter((p) => tieneOferta(p)));
    } catch {
      // se reintenta en la proxima recarga; mientras, queda lo que habia
      setOfertas((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, RECARGA_MS);
    return () => clearInterval(id);
  }, [cargar]);

  return ofertas;
}

/** Indice que avanza cada `segundos` sobre `total` elementos. */
export function useRotacion(total: number, segundos: number, activo = true): number {
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    if (!activo || total < 2) return;
    const id = setInterval(() => setIndice((i) => (i + 1) % total), segundos * 1000);
    return () => clearInterval(id);
  }, [total, segundos, activo]);
  return total > 0 ? indice % total : 0;
}
