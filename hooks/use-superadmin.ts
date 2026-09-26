"use client";

// hooks/use-superadmin.ts — estado de sesion del panel /superadmin en el
// cliente. Separado de hooks/use-auth.ts a proposito: ese es el estado del
// admin/cajero de UN comercio; el superadmin no pertenece a ninguno.
import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/utils/api-url";

const STORAGE_KEY = "kiosko_superadmin";

export interface SuperadminUser {
  email: string;
  nombre: string;
}

function readStored(): SuperadminUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SuperadminUser) : null;
  } catch {
    return null;
  }
}

export function setSuperadminActual(u: SuperadminUser | null): void {
  if (typeof window === "undefined") return;
  if (u) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function useSuperadmin() {
  const [user, setUser] = useState<SuperadminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStored());
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    setSuperadminActual(null);
    setUser(null);
    fetch(apiUrl("/api/auth/logout"), { method: "POST" }).catch(() => {});
  }, []);

  return { user, ready, logout };
}
