import { apiUrl } from "@/lib/utils/api-url"
// services/auth-service.ts — login por PIN y acceso a la demo (client helpers)
import { setCurrentUser, DEFAULT_COMERCIO_ID } from "@/hooks/use-auth";
import type { Usuario } from "@/lib/types";
import type { VisitaDemo } from "@/lib/demo";

async function entrarConPin(ruta: string, datos: Record<string, unknown>): Promise<Usuario> {
  const res = await fetch(apiUrl(ruta), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "PIN incorrecto");
  const user: Usuario = {
    id: data.id,
    nombre: data.nombre,
    rol: data.rol,
    comercioId: data.comercioId ?? DEFAULT_COMERCIO_ID,
    comercioSlug: data.comercioSlug,
    comercioNombre: data.comercioNombre,
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
  return entrarConPin("/api/auth/login", { pin });
}

/** Demo publica: con nombre y WhatsApp de quien entra (los ve el superadmin). */
export function loginDemo(visita: VisitaDemo): Promise<Usuario> {
  return entrarConPin("/api/auth/demo", { ...visita });
}
