import { apiUrl } from "@/lib/utils/api-url"
// services/usuarios-service.ts — administracion de empleados (client, service role via API)
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
    email: d.email ?? undefined,
    telefono: d.telefono ?? undefined,
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
  rol: UserRol;
  /** Obligatorio si rol = 'admin' (es lo que valida el login de Google). */
  email?: string;
  /** Dato de contacto, nunca se usa para iniciar sesion. */
  telefono?: string;
  /** Obligatorio si rol != 'admin'. */
  pin?: string;
}

export async function crearUsuario(input: CrearUsuarioInput): Promise<void> {
  const res = await fetch(apiUrl("/api/usuarios"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo crear el empleado");
  }
}

export interface ActualizarUsuarioInput {
  nombre: string;
  rol: UserRol;
  activo: boolean;
  email?: string;
  telefono?: string;
  pin?: string;
}

export async function actualizarUsuario(id: string, input: ActualizarUsuarioInput): Promise<void> {
  const res = await fetch(apiUrl("/api/usuarios"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuarioId: id, input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo actualizar el empleado");
  }
}
