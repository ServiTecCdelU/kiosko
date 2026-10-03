import { apiUrl } from "@/lib/utils/api-url"
// services/auth-service.ts — login por PIN y acceso a la demo (client helpers)
import { setCurrentUser, DEFAULT_COMERCIO_ID } from "@/hooks/use-auth";
import type { Usuario } from "@/lib/types";

/** El servidor no sabe de que comercio es: hay que pedir el codigo. */
export class FaltaComercioError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FaltaComercioError";
  }
}

async function entrarConPin(ruta: string, pin: string, comercio?: string): Promise<Usuario> {
  const res = await fetch(apiUrl(ruta), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, comercio }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data?.faltaComercio) throw new FaltaComercioError(data.error);
    throw new Error(data?.error ?? "PIN incorrecto");
  }
  const user: Usuario = {
    id: data.id,
    nombre: data.nombre,
    rol: data.rol,
    comercioId: data.comercioId ?? DEFAULT_COMERCIO_ID,
    comercioSlug: data.comercioSlug,
    activo: true,
    createdAt: new Date(),
  };
  setCurrentUser(user);
  return user;
}

/** PIN de un empleado (cajero/encargado), siempre dentro de SU comercio (slug). */
export function login(pin: string, comercio: string): Promise<Usuario> {
  return entrarConPin("/api/auth/login", pin, comercio);
}

/** PIN de la demo: solo entra al comercio demo. */
export function loginDemo(pin: string): Promise<Usuario> {
  return entrarConPin("/api/auth/demo", pin);
}
