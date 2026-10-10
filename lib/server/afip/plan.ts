// lib/server/afip/plan.ts — quien puede usar la facturacion electronica.
// La demo no (pide credenciales reales) y el plan Basico tampoco: es del Pro
// (decidido 2026-10-10, lib/suscripcion.ts). Lo usan las rutas de /api/afip que
// escriben y la emision (facturar.ts). Leer el estado sigue abierto para que la
// pantalla muestre el aviso de plan.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { esComercioDemo } from "@/lib/server/demo";
import { MENSAJE_FACTURACION_PRO, planIncluyeFacturacion } from "@/lib/suscripcion";

export const VERSION_PAGA = "La facturación electrónica está disponible en la versión paga.";

/** true si el plan del comercio incluye facturacion (no mira la demo). */
export async function facturacionEnPlan(comercioId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("comercios").select("plan").eq("id", comercioId).maybeSingle();
  return planIncluyeFacturacion(data?.plan);
}

/** Mensaje de por que NO puede facturar (demo o plan Basico), o null si puede. */
export async function motivoSinFacturacion(comercioId: string): Promise<string | null> {
  if (await esComercioDemo(comercioId)) return VERSION_PAGA;
  if (!(await facturacionEnPlan(comercioId))) return MENSAJE_FACTURACION_PRO;
  return null;
}
