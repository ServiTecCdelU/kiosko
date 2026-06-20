// services/auth-service.ts — login por PIN (client helper)
import { setCurrentUser, DEFAULT_COMERCIO_ID } from "@/hooks/use-auth";
import type { Usuario } from "@/lib/types";

export async function login(pin: string): Promise<Usuario> {
  const res = await fetch("/api/auth/login", {
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
    activo: true,
    createdAt: new Date(),
  };
  setCurrentUser(user);
  return user;
}
