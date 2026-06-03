"use client";

import { useState, useEffect, useCallback } from "react";
import type { Usuario, UserRol } from "@/lib/types";

const STORAGE_KEY = "kiosko_user";
let cached: Usuario | null | undefined = undefined;

function readStored(): Usuario | null {
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
