// services/usuarios-service.ts — administracion de usuarios (client, service role via API)
import { consultar } from "@/services/api-client";
import { getComercioId } from "@/hooks/use-auth";
import type { Usuario, UserRol } from "@/lib/types";

function mapUsuario(d: Record<string, any>): Usuario {
  return {
    id: d.id,
    nombre: d.nombre,
    rol: d.rol,
    comercioId: d.comercio_id,
    activo: d.activo,
    createdAt: new Date(d.created_at),
  };
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { usuarios } = await consultar<{ usuarios: Record<string, any>[] }>(
    "/api/consultas/usuarios", "listar",
  );
  return usuarios.map(mapUsuario);
}

export interface CrearUsuarioInput {
  nombre: string;
  pin: string;
  rol: UserRol;
}

export async function crearUsuario(input: CrearUsuarioInput): Promise<void> {
  const res = await fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo crear el usuario");
  }
}

export interface ActualizarUsuarioInput {
  nombre: string;
  rol: UserRol;
  activo: boolean;
  pin?: string;
}

export async function actualizarUsuario(id: string, input: ActualizarUsuarioInput): Promise<void> {
  const res = await fetch("/api/usuarios", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuarioId: id, input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo actualizar el usuario");
  }
}
