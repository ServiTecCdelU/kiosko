"use client";
import { apiUrl } from "@/lib/utils/api-url"

import { useState, useEffect, useCallback } from "react";
import type { Usuario, UserRol } from "@/lib/types";

const STORAGE_KEY = "kiosko_user";
let cached: Usuario | null | undefined = undefined;

// Login por PIN activo — ver app/login/page.tsx, supabase/20_pin_hash.sql y
// supabase/25_usuarios_crud.sql. Requiere que exista al menos un usuario
// admin real en la tabla `usuarios` antes de desplegar este cambio.
export const AUTH_DISABLED = false;
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
  // Cambio de usuario (login, registro, salir de la demo): una validacion que
  // arranco con el usuario anterior ya no sirve y no puede pisar al nuevo.
  generacion++;
  validacion = null;
  guardarUsuario(u);
}

/** Avisa a los useAuth montados (ej. el menu) que cambio el usuario guardado. */
const EVENTO_USUARIO = "kiosko:usuario";

function guardarUsuario(u: Usuario | null): void {
  cached = u;
  if (typeof window === "undefined") return;
  if (u) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  else sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENTO_USUARIO));
}

export function getCurrentUser(): Usuario | null {
  return readStored();
}

// El comercio de cada request lo decide el servidor con la cookie de sesion
// (lib/server/sesion.ts): el cliente nunca lo manda.

// Una sola validacion por carga de pagina aunque varios componentes usen el hook.
let validacion: Promise<void> | null = null;
// Sube con cada setCurrentUser: la respuesta de una validacion que arranco con
// otro usuario (ej. la demo antes de registrarse) se descarta.
let generacion = 0;

function validarSesion(stored: Usuario): Promise<void> {
  const gen = generacion;
  validacion ??= fetch(apiUrl("/api/auth/session"))
    .then(async (res) => {
      if (gen !== generacion) return;
      if (res.status === 401) {
        guardarUsuario(null);
        return;
      }
      if (res.ok) {
        const datos = (await res.json()) as Usuario;
        if (gen !== generacion) return;
        // Si cambio el usuario (otra cuenta en la misma pestaña), no se mezclan
        // los datos guardados del anterior: manda lo que dice el servidor.
        guardarUsuario(datos.id === stored.id ? { ...stored, ...datos } : datos);
      }
    })
    // Sin red (modo offline del POS) se sigue con el usuario guardado.
    .catch(() => {});
  return validacion;
}

/** Sesion vencida a mitad de uso: limpia el usuario y vuelve al login. */
export function sesionVencida(): void {
  setCurrentUser(null);
  if (typeof window !== "undefined") window.location.assign(apiUrl("/login"));
}

export function useAuth() {
  const [user, setUser] = useState<Usuario | null>(() => readStored());
  const [ready, setReady] = useState(false);

  // Cambios del usuario guardado en otra parte de la pantalla (ej. "Mi comercio" prende un
  // modulo y el menu tiene que mostrarlo ya).
  useEffect(() => {
    const alCambiar = () => setUser(readStored());
    window.addEventListener(EVENTO_USUARIO, alCambiar);
    return () => window.removeEventListener(EVENTO_USUARIO, alCambiar);
  }, []);

  useEffect(() => {
    const stored = readStored();
    setUser(stored);
    // El usuario guardado puede sobrevivir a la cookie (vence a las 12 h): se
    // valida contra el servidor una vez por carga de pagina. Tambien completa
    // datos nuevos (ej. el slug) de sesiones guardadas antes.
    if (stored && !AUTH_DISABLED) {
      validarSesion(stored)
        .then(() => setUser(readStored()))
        .finally(() => setReady(true));
      return;
    }
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setUser(null);
    // Borra la cookie de sesion firmada del servidor (fire-and-forget).
    fetch(apiUrl("/api/auth/logout"), { method: "POST" }).catch(() => {});
  }, []);

  const rol: UserRol | null = user?.rol ?? null;
  return { user, ready, logout, rol };
}
