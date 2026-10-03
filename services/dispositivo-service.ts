// services/dispositivo-service.ts — PCs registradas y PIN del empleado (client helpers).
import { apiUrl } from "@/lib/utils/api-url";

export interface EstaPc {
  registrada: boolean;
  comercio?: string;
  caja?: string;
  nombre?: string;
}

export interface PcRegistrada {
  id: string;
  nombre: string;
  puestoId: string;
  puestoNombre: string;
  createdAt: string;
  ultimoUso: string | null;
  esEsta: boolean;
}

async function pedir<T>(ruta: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(ruta), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo completar la operación");
  return data as T;
}

/** "¿Que PC es esta?" (pantalla de login, sin sesion). */
export const getEstaPc = () => pedir<EstaPc>("/api/dispositivo", "GET");

// ── Solo el dueño ──
export const listarPcs = () => pedir<{ dispositivos: PcRegistrada[] }>("/api/dispositivos", "GET").then((r) => r.dispositivos);
export const registrarEstaPc = (puestoId: string, nombre: string) => pedir<{ ok: true }>("/api/dispositivos", "POST", { puestoId, nombre });
export const quitarPc = (id: string) => pedir<{ ok: true }>("/api/dispositivos", "DELETE", { id });

/** El empleado elige su PIN de 6 (obligatorio si entro con el viejo de 4). */
export const cambiarMiPin = (pin: string) => pedir<{ ok: true }>("/api/auth/cambiar-pin", "POST", { pin });
