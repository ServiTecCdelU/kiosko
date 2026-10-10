// lib/acceso-comercio.ts — si un comercio puede operar o queda en solo lectura.
//
// Reglas (decididas 2026-10-03, billing 2026-10-10):
// - "prueba": los ultimos DIAS_AVISO dias se avisa; al vencer trial_hasta hay
//   DIAS_GRACIA dias mas de uso normal con cartel; despues, solo lectura.
// - "suspendido" y "baja": solo lectura al instante (los pone el superadmin).
// - "activo" con plan pago y suscripcion_hasta cargada: los ultimos DIAS_AVISO
//   dias se avisa; vencida hay DIAS_GRACIA_PAGO dias de gracia (el "hasta el
//   dia 10" de siempre); despues, solo lectura hasta que pague.
//   Sin precio (plan free o precio 0) o sin fecha: acceso completo.
// Solo lectura = puede entrar, ver y exportar todo, pero no vender ni editar:
// no pierde sus datos y ve lo que dejaria de tener.
//
// Funcion pura: la usan proxy.ts (para cortar escrituras) y /api/acceso (para
// el cartel). Testeada en acceso-comercio.test.ts y acceso-comercio-pago.test.ts.

export const DIAS_AVISO = 5;
export const DIAS_GRACIA = 3;
export const DIAS_GRACIA_PAGO = 10;
const DIA_MS = 86_400_000;

export type NivelAcceso = "completo" | "solo_lectura";
export type MotivoAcceso =
  | "ok"
  | "prueba_por_vencer"
  | "prueba_en_gracia"
  | "prueba_vencida"
  | "pago_por_vencer"
  | "pago_en_gracia"
  | "pago_vencido"
  | "suspendido"
  | "baja";

export interface EstadoAcceso {
  nivel: NivelAcceso;
  motivo: MotivoAcceso;
  /** Por vencer: dias que quedan. En gracia: dias hasta el bloqueo. */
  dias?: number;
  /** trial_hasta o suscripcion_hasta del comercio, para mostrar la fecha. */
  venceEl?: string;
}

export interface ComercioAcceso {
  estado: string;
  trial_hasta: string | null;
  /** Billing (49): solo cuentan si el plan tiene precio. */
  suscripcion_hasta?: string | null;
  precio_mensual?: number | null;
}

function escalera(
  venceEl: string,
  ahora: Date,
  diasGracia: number,
  motivos: { porVencer: MotivoAcceso; enGracia: MotivoAcceso; vencido: MotivoAcceso },
): EstadoAcceso {
  const faltan = new Date(venceEl).getTime() - ahora.getTime();
  if (faltan > 0) {
    const dias = Math.ceil(faltan / DIA_MS);
    return dias <= DIAS_AVISO
      ? { nivel: "completo", motivo: motivos.porVencer, dias, venceEl }
      : { nivel: "completo", motivo: "ok", venceEl };
  }
  const graciaRestante = diasGracia * DIA_MS + faltan;
  if (graciaRestante > 0) {
    return { nivel: "completo", motivo: motivos.enGracia, dias: Math.ceil(graciaRestante / DIA_MS), venceEl };
  }
  return { nivel: "solo_lectura", motivo: motivos.vencido, venceEl };
}

export function evaluarAcceso(comercio: ComercioAcceso, ahora: Date = new Date()): EstadoAcceso {
  if (comercio.estado === "suspendido") return { nivel: "solo_lectura", motivo: "suspendido" };
  if (comercio.estado === "baja") return { nivel: "solo_lectura", motivo: "baja" };
  if (comercio.estado === "prueba" && comercio.trial_hasta) {
    return escalera(comercio.trial_hasta, ahora, DIAS_GRACIA, {
      porVencer: "prueba_por_vencer", enGracia: "prueba_en_gracia", vencido: "prueba_vencida",
    });
  }
  if (comercio.estado === "activo" && (comercio.precio_mensual ?? 0) > 0 && comercio.suscripcion_hasta) {
    return escalera(comercio.suscripcion_hasta, ahora, DIAS_GRACIA_PAGO, {
      porVencer: "pago_por_vencer", enGracia: "pago_en_gracia", vencido: "pago_vencido",
    });
  }
  return { nivel: "completo", motivo: "ok" };
}

/** Motivos que se arreglan pagando la suscripcion. */
export function esMotivoDePago(motivo: MotivoAcceso): boolean {
  return motivo === "pago_por_vencer" || motivo === "pago_en_gracia" || motivo === "pago_vencido";
}

/**
 * true si el request pasa igual en solo lectura: no modifica datos del
 * comercio (las consultas van por POST pero son un conjunto cerrado de
 * lecturas, services/api-client.ts; imprimir un ticket tampoco toca la base)
 * o es pagar la suscripcion (si no, un comercio bloqueado por falta de pago no
 * podria salir del bloqueo).
 */
export function esLectura(ruta: string, metodo: string): boolean {
  if (metodo.toUpperCase() === "GET") return true;
  return (
    ruta.startsWith("/api/consultas/") ||
    ruta === "/api/imprimir-ticket" ||
    ruta.startsWith("/api/imprimir-ticket/") ||
    ruta === "/api/billing" ||
    ruta.startsWith("/api/billing/")
  );
}
