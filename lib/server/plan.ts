// lib/server/plan.ts — que funciones puede usar el comercio segun su plan
// (decidido 2026-10-10, reglas puras en lib/suscripcion.ts). La demo tampoco
// puede (pide credenciales reales). Lo usan las rutas que escriben y la emision;
// leer el estado sigue abierto para que las pantallas muestren el aviso de plan.
//
// - Facturacion electronica ARCA: plan Pro (lib/server/afip/facturar.ts y /api/afip/*).
// - Mercado Pago (conectar cuenta, QR y Point): plan Pro (/api/mercadopago/*).
// - Cajas extra: tope del plan en lib/server/billing.ts (errorAlSumarCaja).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { esComercioDemo } from "@/lib/server/demo";
import { MENSAJE_FACTURACION_PRO, MENSAJE_MP_PRO, planIncluyeFacturacion, planIncluyeMercadoPago } from "@/lib/suscripcion";

export const VERSION_PAGA = "La facturación electrónica está disponible en la versión paga.";

export async function planDeComercio(comercioId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("comercios").select("plan").eq("id", comercioId).maybeSingle();
  return data?.plan ?? null;
}

/** true si el plan del comercio incluye facturacion (no mira la demo). */
export async function facturacionEnPlan(comercioId: string): Promise<boolean> {
  return planIncluyeFacturacion(await planDeComercio(comercioId));
}

/** Mensaje de por que NO puede facturar (demo o plan Basico), o null si puede. */
export async function motivoSinFacturacion(comercioId: string): Promise<string | null> {
  if (await esComercioDemo(comercioId)) return VERSION_PAGA;
  if (!(await facturacionEnPlan(comercioId))) return MENSAJE_FACTURACION_PRO;
  return null;
}

/** Mensaje de por que NO puede cobrar con Mercado Pago, QR o Point (plan Basico), o null si puede. */
export async function motivoSinMercadoPago(comercioId: string): Promise<string | null> {
  if (!planIncluyeMercadoPago(await planDeComercio(comercioId))) return MENSAJE_MP_PRO;
  return null;
}
