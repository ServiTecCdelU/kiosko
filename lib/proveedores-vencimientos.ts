// lib/proveedores-vencimientos.ts — recordatorios de pago a proveedores:
// que compras con saldo vencieron o vencen pronto (compras.vence, migracion 44).
// Logica pura; la fecha "hoy" se pasa como "YYYY-MM-DD" (hora argentina).

/** Dias hacia adelante que cuentan como "vence pronto". */
export const DIAS_AVISO_PAGO = 7;

export type EstadoPago = "vencido" | "hoy" | "pronto" | "ok" | "sin-fecha";

export interface VencimientoPago {
  estado: EstadoPago;
  /** Dias hasta el vencimiento (negativo = vencido). null sin fecha. */
  dias: number | null;
}

function diasEntre(desdeIso: string, hastaIso: string): number {
  const [a1, m1, d1] = desdeIso.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = hastaIso.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function estadoPago(vence: string | null | undefined, hoy: string): VencimientoPago {
  if (!vence || !/^\d{4}-\d{2}-\d{2}/.test(vence)) return { estado: "sin-fecha", dias: null };
  const dias = diasEntre(hoy, vence);
  if (dias < 0) return { estado: "vencido", dias };
  if (dias === 0) return { estado: "hoy", dias };
  if (dias <= DIAS_AVISO_PAGO) return { estado: "pronto", dias };
  return { estado: "ok", dias };
}

/** "Venció hace 3 días", "Vence hoy", "Vence en 5 días", "Vence el 15/10" o null sin fecha. */
export function textoPago(v: VencimientoPago, vence?: string | null): string | null {
  if (v.estado === "sin-fecha" || v.dias === null) return null;
  if (v.estado === "vencido") return v.dias === -1 ? "Venció ayer" : `Venció hace ${-v.dias} días`;
  if (v.estado === "hoy") return "Vence hoy";
  if (v.estado === "pronto") return v.dias === 1 ? "Vence mañana" : `Vence en ${v.dias} días`;
  const [, m, d] = (vence ?? "").slice(0, 10).split("-");
  return d && m ? `Vence el ${d}/${m}` : "Vence más adelante";
}

export interface CompraPendiente {
  id: string;
  proveedorId: string;
  saldo: number;
  vence?: string | null;
}

export interface ResumenPagos {
  vencidas: number;
  montoVencido: number;
  /** Vencen hoy o dentro de DIAS_AVISO_PAGO dias. */
  proximas: number;
  montoProximo: number;
  /** La fecha pendiente mas cercana (vencida o no), si hay. */
  proximaFecha: string | null;
  /** Compras con saldo y sin fecha pactada. */
  sinFecha: number;
}

export function resumenPagos(compras: CompraPendiente[], hoy: string): ResumenPagos {
  const r: ResumenPagos = { vencidas: 0, montoVencido: 0, proximas: 0, montoProximo: 0, proximaFecha: null, sinFecha: 0 };
  for (const c of compras) {
    if (!(c.saldo > 0)) continue;
    const v = estadoPago(c.vence, hoy);
    if (v.estado === "sin-fecha") {
      r.sinFecha++;
      continue;
    }
    if (v.estado === "vencido") {
      r.vencidas++;
      r.montoVencido += c.saldo;
    } else if (v.estado === "hoy" || v.estado === "pronto") {
      r.proximas++;
      r.montoProximo += c.saldo;
    }
    const f = c.vence!.slice(0, 10);
    if (!r.proximaFecha || f < r.proximaFecha) r.proximaFecha = f;
  }
  r.montoVencido = Math.round(r.montoVencido * 100) / 100;
  r.montoProximo = Math.round(r.montoProximo * 100) / 100;
  return r;
}

const ORDEN: Record<EstadoPago, number> = { vencido: 0, hoy: 1, pronto: 2, ok: 3, "sin-fecha": 4 };

/** Primero lo vencido (mas viejo primero), despues lo que vence antes, al final lo sin fecha. */
export function ordenarPorUrgencia<T extends { vence?: string | null }>(compras: T[], hoy: string): T[] {
  return [...compras].sort((a, b) => {
    const ea = estadoPago(a.vence, hoy);
    const eb = estadoPago(b.vence, hoy);
    if (ORDEN[ea.estado] !== ORDEN[eb.estado]) return ORDEN[ea.estado] - ORDEN[eb.estado];
    return (a.vence ?? "").localeCompare(b.vence ?? "");
  });
}
