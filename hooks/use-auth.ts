"use client";

import { useState, useEffect, useCallback } from "react";
import type { Usuario, UserRol } from "@/lib/types";

const STORAGE_KEY = "kiosko_user";
let cached: Usuario | null | undefined = undefined;

// ── Auth temporalmente DESACTIVADO ──────────────────────────────
// Se entra directo como admin demo mientras se implementa el login
// con Google. Para reactivar el login por PIN: poner AUTH_DISABLED = false.
export const AUTH_DISABLED = true;
// Comercio por defecto mientras hay un solo tenant / auth desactivado.
export const DEFAULT_COMERCIO_ID = "comercio_1";

const DEMO_USER: Usuario = {
  id: "usuario_admin_1",
  nombre: "Administrador",
  rol: "admin",
  comercioId: DEFAULT_COMERCIO_ID,
  activo: true,
  createdAt: new Date(),
};

function readStored(): Usuario | null {
  if (AUTH_DISABLED) return DEMO_USER;
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function setCurrentUser(u: Usuario | null): void {
  cached = u;
  if (typeof window === "undefined") return;
  if (u) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function getCurrentUser(): Usuario | null {
  return readStored();
}

/** Comercio (tenant) del usuario actual. Base para scopear toda consulta. */
export function getComercioId(): string {
  return readStored()?.comercioId ?? DEFAULT_COMERCIO_ID;
}

export function useAuth() {
  const [user, setUser] = useState<Usuario | null>(() => readStored());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStored());
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setUser(null);
  }, []);

  const rol: UserRol | null = user?.rol ?? null;
  return { user, ready, logout, rol };
}
