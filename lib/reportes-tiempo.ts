// lib/reportes-tiempo.ts — ventas por hora y por dia de la semana, y corte de
// dia, en hora argentina. Logica pura (sin Supabase) para poder testearla.
// El servidor (Vercel) corre en UTC: usar la hora local del server corria el
// dia despues de las 21 hs.

const ZONA = "America/Argentina/Buenos_Aires";

const fmtPartes = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short",
});

export interface MomentoArgentina {
  /** YYYY-MM-DD */
  dia: string;
  /** 0-23 */
  hora: number;
  /** 0 = domingo ... 6 = sabado */
  diaSemana: number;
}

const DIAS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_SEMANA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function momentoArgentina(fecha: string | Date): MomentoArgentina {
  const partes = fmtPartes.formatToParts(new Date(fecha));
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  // Intl puede devolver "24" para la medianoche en algunos runtimes.
  const hora = Number(v("hour")) % 24;
  return {
    dia: `${v("year")}-${v("month")}-${v("day")}`,
    hora,
    diaSemana: Math.max(0, DIAS_EN.indexOf(v("weekday"))),
  };
}

export interface VentaMinima {
  created_at: string;
  total: number | string;
}

export interface VentasPorHora {
  hora: number;
  total: number;
  cantidad: number;
}

export interface VentasPorDiaSemana {
  diaSemana: number;
  label: string;
  total: number;
  cantidad: number;
  /** Promedio por dia calendario con ventas de ese dia de la semana. */
  promedio: number;
}

/** Las 24 horas, con cero donde no hubo ventas. */
export function agruparPorHora(ventas: VentaMinima[]): VentasPorHora[] {
  const out: VentasPorHora[] = Array.from({ length: 24 }, (_, hora) => ({ hora, total: 0, cantidad: 0 }));
  for (const v of ventas) {
    const { hora } = momentoArgentina(v.created_at);
    out[hora].total += Number(v.total) || 0;
    out[hora].cantidad += 1;
  }
  return out;
}

/** Los 7 dias (domingo primero), con el promedio por dia calendario. */
export function agruparPorDiaSemana(ventas: VentaMinima[]): VentasPorDiaSemana[] {
  const out: VentasPorDiaSemana[] = DIAS_SEMANA.map((label, diaSemana) => ({ diaSemana, label, total: 0, cantidad: 0, promedio: 0 }));
  const diasConVentas: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());
  for (const v of ventas) {
    const { dia, diaSemana } = momentoArgentina(v.created_at);
    out[diaSemana].total += Number(v.total) || 0;
    out[diaSemana].cantidad += 1;
    diasConVentas[diaSemana].add(dia);
  }
  for (const d of out) {
    const n = diasConVentas[d.diaSemana].size;
    d.promedio = n > 0 ? d.total / n : 0;
  }
  return out;
}

/** Franja horaria con mas ventas (por plata); null si no hay ventas. */
export function horaPico(porHora: VentasPorHora[]): VentasPorHora | null {
  let mejor: VentasPorHora | null = null;
  for (const h of porHora) if (h.cantidad > 0 && (!mejor || h.total > mejor.total)) mejor = h;
  return mejor;
}

/** "14 a 15 hs" */
export function etiquetaHora(hora: number): string {
  return `${hora} a ${(hora + 1) % 24} hs`;
}
