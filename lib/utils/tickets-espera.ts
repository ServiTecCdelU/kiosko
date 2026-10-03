// lib/utils/tickets-espera.ts — carritos suspendidos (cliente "ya vuelvo") en localStorage.
// No usa Supabase: es una pausa momentánea en el mismo dispositivo, no un dato de negocio a sincronizar.
import type { CartItem } from "@/lib/types";
import { claveDelComercioActual } from "@/lib/clave-comercio";

export interface TicketEnEspera {
  id: string;
  nota: string;
  items: CartItem[];
  createdAt: string; // ISO
}

const STORAGE_KEY = "kiosko:tickets-espera";

function readAll(): TicketEnEspera[] {
  if (typeof window === "undefined") return [];
  try {
    // Por comercio: el ticket suspendido de un comercio no aparece en otro (misma PC).
    const clave = claveDelComercioActual(STORAGE_KEY);
    const raw = clave ? window.localStorage.getItem(clave) : null;
    return raw ? (JSON.parse(raw) as TicketEnEspera[]) : [];
  } catch {
    return [];
  }
}

function writeAll(tickets: TicketEnEspera[]): void {
  if (typeof window === "undefined") return;
  const clave = claveDelComercioActual(STORAGE_KEY);
  if (clave) window.localStorage.setItem(clave, JSON.stringify(tickets));
}

export function listarTicketsEnEspera(): TicketEnEspera[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function suspenderTicket(items: CartItem[], nota: string): void {
  const tickets = readAll();
  tickets.push({
    id: crypto.randomUUID(),
    nota,
    items,
    createdAt: new Date().toISOString(),
  });
  writeAll(tickets);
}

export function quitarTicketEnEspera(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}
