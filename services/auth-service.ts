// services/auth-service.ts — login por PIN (client helper)
import { setCurrentUser } from "@/hooks/use-auth";
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
    activo: true,
    createdAt: new Date(),
  };
  setCurrentUser(user);
  return user;
}
