// lib/acceso-comercio.ts — si un comercio puede operar o queda en solo lectura.
//
// Reglas (decididas 2026-10-03):
// - "prueba": los ultimos DIAS_AVISO dias se avisa; al vencer trial_hasta hay
//   DIAS_GRACIA dias mas de uso normal con cartel; despues, solo lectura.
// - "suspendido" y "baja": solo lectura al instante (los pone el superadmin).
// - "activo": acceso completo (el cobro mensual lo avisa lib/aviso-pago.ts).
// Solo lectura = puede entrar, ver y exportar todo, pero no vender ni editar:
// no pierde sus datos y ve lo que dejaria de tener.
//
// Funcion pura: la usan proxy.ts (para cortar escrituras) y /api/acceso (para
// el cartel). Testeada en acceso-comercio.test.ts.

export const DIAS_AVISO = 5;
export const DIAS_GRACIA = 3;
const DIA_MS = 86_400_000;

export type NivelAcceso = "completo" | "solo_lectura";
export type MotivoAcceso =
  | "ok"
  | "prueba_por_vencer"
  | "prueba_en_gracia"
  | "prueba_vencida"
  | "suspendido"
  | "baja";

export interface EstadoAcceso {
  nivel: NivelAcceso;
  motivo: MotivoAcceso;
  /** Por vencer: dias de prueba que quedan. En gracia: dias hasta el bloqueo. */
  dias?: number;
  /** trial_hasta del comercio, para mostrar la fecha. */
  venceEl?: string;
}

export interface ComercioAcceso {
  estado: string;
  trial_hasta: string | null;
}

export function evaluarAcceso(comercio: ComercioAcceso, ahora: Date = new Date()): EstadoAcceso {
  if (comercio.estado === "suspendido") return { nivel: "solo_lectura", motivo: "suspendido" };
  if (comercio.estado === "baja") return { nivel: "solo_lectura", motivo: "baja" };
  if (comercio.estado !== "prueba" || !comercio.trial_hasta) return { nivel: "completo", motivo: "ok" };

  const venceEl = comercio.trial_hasta;
  const faltan = new Date(venceEl).getTime() - ahora.getTime();

  if (faltan > 0) {
    const dias = Math.ceil(faltan / DIA_MS);
    return dias <= DIAS_AVISO
      ? { nivel: "completo", motivo: "prueba_por_vencer", dias, venceEl }
      : { nivel: "completo", motivo: "ok", venceEl };
  }

  const graciaRestante = DIAS_GRACIA * DIA_MS + faltan;
  if (graciaRestante > 0) {
    return { nivel: "completo", motivo: "prueba_en_gracia", dias: Math.ceil(graciaRestante / DIA_MS), venceEl };
  }
  return { nivel: "solo_lectura", motivo: "prueba_vencida", venceEl };
}

/**
 * true si el request no modifica datos: en solo lectura pasa igual. Las
 * consultas van por POST pero son un conjunto cerrado de lecturas
 * (services/api-client.ts); imprimir un ticket tampoco toca la base.
 */
export function esLectura(ruta: string, metodo: string): boolean {
  if (metodo.toUpperCase() === "GET") return true;
  return ruta.startsWith("/api/consultas/") || ruta === "/api/imprimir-ticket" || ruta.startsWith("/api/imprimir-ticket/");
}
