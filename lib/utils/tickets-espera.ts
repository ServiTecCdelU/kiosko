// lib/utils/tickets-espera.ts — carritos suspendidos (cliente "ya vuelvo") en localStorage.
// No usa Supabase: es una pausa momentánea en el mismo dispositivo, no un dato de negocio a sincronizar.
import type { CartItem } from "@/lib/types";

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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TicketEnEspera[]) : [];
  } catch {
    return [];
  }
}

function writeAll(tickets: TicketEnEspera[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
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
