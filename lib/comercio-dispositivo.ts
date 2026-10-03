// lib/comercio-dispositivo.ts — de que comercio es este dispositivo (PC/tablet del mostrador).
//
// El login por PIN de empleados es SIEMPRE dentro de un comercio (dos kioscos
// pueden tener cajeros con el mismo PIN). Cuando alguien entra en el
// dispositivo (dueño con Google, empleado o demo), se recuerda el comercio y
// el cajero solo pone su PIN. En un dispositivo nuevo se pide el codigo (el
// final del link del panel: /kiosco-el-sol).

const CLAVE = "kiosko:comercio-dispositivo";

export interface ComercioDispositivo {
  slug: string;
}

/**
 * Lo que tipea o pega el empleado -> slug. Acepta "kiosco-el-sol", "/kiosco-el-sol"
 * o el link entero del panel (".../comercio/kiosco-el-sol").
 */
export function normalizarCodigoComercio(texto: string): string {
  const limpio = texto.trim().toLowerCase().split(/[?#]/)[0].replace(/\/+$/, "");
  const ultimo = limpio.split("/").filter(Boolean).pop() ?? "";
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(ultimo) ? ultimo : "";
}

export function leerComercioDispositivo(): ComercioDispositivo | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    const c = raw ? (JSON.parse(raw) as ComercioDispositivo) : null;
    return c?.slug ? c : null;
  } catch {
    return null;
  }
}

export function recordarComercioDispositivo(slug: string | null | undefined): void {
  if (!slug) return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ slug }));
  } catch {
    // sin almacenamiento: se va a pedir el codigo cada vez
  }
}

export function olvidarComercioDispositivo(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // nada
  }
}
