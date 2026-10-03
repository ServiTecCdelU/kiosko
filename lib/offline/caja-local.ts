// lib/offline/caja-local.ts — ultima lista de cajas abiertas que vio el POS.
// Si se recarga la pagina sin internet, el POS no puede pedirla al servidor y
// las ventas offline quedaban sin caja (fuera del arqueo). Con esto sigue
// vendiendo en la misma caja; si para cuando sincroniza esa caja ya se cerro,
// el dialogo de ventas sin conexion ofrece pasarla a la caja actual.
import type { Caja } from "@/lib/types";
import { claveDelComercioActual } from "@/lib/clave-comercio";

const CLAVE = "kiosko:cajas-abiertas";
/** Mas viejo que esto no se usa: la caja seguramente ya se cerro. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export function guardarCajasConocidas(cajas: Caja[]): void {
  try {
    const clave = claveDelComercioActual(CLAVE);
    if (clave) localStorage.setItem(clave, JSON.stringify({ guardado: Date.now(), cajas }));
  } catch {
    // sin almacenamiento: offline no va a recordar la caja, nada mas
  }
}

export function leerCajasConocidas(): Caja[] {
  try {
    const clave = claveDelComercioActual(CLAVE);
    const raw = clave ? localStorage.getItem(clave) : null;
    if (!raw) return [];
    const { guardado, cajas } = JSON.parse(raw) as { guardado: number; cajas: Caja[] };
    return Date.now() - guardado < VIGENCIA_MS && Array.isArray(cajas) ? cajas : [];
  } catch {
    return [];
  }
}
