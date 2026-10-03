import { apiUrl } from "@/lib/utils/api-url"
// services/auth-service.ts — login por PIN y acceso a la demo (client helpers)
import { setCurrentUser, DEFAULT_COMERCIO_ID } from "@/hooks/use-auth";
import type { Usuario } from "@/lib/types";

async function entrarConPin(ruta: string, pin: string): Promise<Usuario> {
  const res = await fetch(apiUrl(ruta), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "PIN incorrecto");
  const user: Usuario = {
    id: data.id,
    nombre: data.nombre,
    rol: data.rol,
    comercioId: data.comercioId ?? DEFAULT_COMERCIO_ID,
    comercioSlug: data.comercioSlug,
    debeCambiarPin: data.debeCambiarPin === true,
    puestoId: data.puestoId,
    puestoNombre: data.puestoNombre,
    activo: true,
    createdAt: new Date(),
  };
  setCurrentUser(user);
  return user;
}

/** PIN de un empleado (cajero/encargado), en una PC registrada: el comercio y la caja salen de la PC. */
export function login(pin: string): Promise<Usuario> {
  return entrarConPin("/api/auth/login", pin);
}

/** PIN de la demo: solo entra al comercio demo. */
export function loginDemo(pin: string): Promise<Usuario> {
  return entrarConPin("/api/auth/demo", pin);
}
