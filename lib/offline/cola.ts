// lib/offline/cola.ts — reglas de la cola de ventas hechas sin internet (puro, testeado).
//
// Una venta de la cola YA SE COBRO: nunca se borra sola. Reglas al sincronizar:
// - sin red / servidor caido     -> se frena, se reintenta al volver la conexion
// - sesion vencida / modo consulta -> se frena (la venta no es invalida, solo no se puede AHORA)
// - el servidor la rechaza (caja cerrada, stock, producto borrado...) -> queda
//   apartada con el motivo para que alguien la resuelva (reintentar en la caja
//   actual o descartar a conciencia), y se sigue con las demas.
import type { CreateSaleInput } from "@/services/sales-service";

export interface VentaPendiente {
  id: string;
  input: CreateSaleInput;
  createdAt: string; // ISO
  /** Motivo por el que el servidor la rechazo. Con error no se reintenta sola. */
  error?: string | null;
  intentos?: number;
}

export type Clasificacion = "sin_red" | "retenida" | "rechazada";

/** Por nombre (no instanceof) para no atar este modulo a services/. */
export function clasificarError(e: unknown): Clasificacion {
  const nombre = e instanceof Error ? e.name : "";
  if (nombre === "NetworkUnavailableError") return "sin_red";
  if (nombre === "VentaRetenidaError") return "retenida";
  return "rechazada";
}

export interface DepsCola {
  enviar: (v: VentaPendiente) => Promise<unknown>;
  quitar: (id: string) => Promise<void>;
  marcarError: (id: string, motivo: string) => Promise<void>;
}

export interface ResultadoCola {
  sincronizadas: number;
  rechazadas: number;
  /** Por que se freno antes de terminar (null = recorrio toda la cola). */
  frenoPor: "sin_red" | "retenida" | null;
  motivo: string | null;
}

/** Envia en orden las ventas SIN error. Las rechazadas quedan marcadas, nunca se borran. */
export async function procesarCola(pendientes: VentaPendiente[], deps: DepsCola): Promise<ResultadoCola> {
  const r: ResultadoCola = { sincronizadas: 0, rechazadas: 0, frenoPor: null, motivo: null };
  const enOrden = [...pendientes].filter((v) => !v.error).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const venta of enOrden) {
    try {
      await deps.enviar(venta);
      await deps.quitar(venta.id);
      r.sincronizadas++;
    } catch (e) {
      const tipo = clasificarError(e);
      const motivo = e instanceof Error ? e.message : "Error desconocido";
      if (tipo !== "rechazada") {
        r.frenoPor = tipo;
        r.motivo = motivo;
        return r;
      }
      await deps.marcarError(venta.id, motivo);
      r.rechazadas++;
    }
  }
  return r;
}

/** Total de la venta para mostrarla (el servidor recalcula el precio real). */
export function totalPendiente(v: VentaPendiente): number {
  const bruto = v.input.items.reduce((s, i) => s + (Number(i.price) || 0) * i.quantity, 0);
  return Math.max(0, bruto - (Number(v.input.discount) || 0));
}

/** El rechazo fue por la caja (cerrada o de otro comercio): se puede pasar a la caja actual. */
export function esErrorDeCaja(motivo: string | null | undefined): boolean {
  return !!motivo && /caja/i.test(motivo) && /no esta abierta|no está abierta|cerrada/i.test(motivo);
}
