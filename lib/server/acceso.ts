// lib/server/acceso.ts — estado de acceso de un comercio (server-only).
//
// proxy.ts lo consulta en cada ESCRITURA (las lecturas no lo necesitan), asi
// que se cachea un rato en memoria para no sumar una consulta a cada venta.
// Un cambio del superadmin tarda como mucho CACHE_MS en aplicarse en otras
// instancias; en la misma instancia se aplica al instante (olvidarAcceso).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluarAcceso, type EstadoAcceso } from "@/lib/acceso-comercio";
import { DEMO_SLUG } from "@/lib/demo";

const CACHE_MS = 60_000;
const cache = new Map<string, { valor: EstadoAcceso; hasta: number }>();

const COMPLETO: EstadoAcceso = { nivel: "completo", motivo: "ok" };

export async function accesoDeComercio(comercioId: string): Promise<EstadoAcceso> {
  const guardado = cache.get(comercioId);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;

  const { data, error } = await supabaseAdmin
    .from("comercios")
    .select("estado, trial_hasta, slug")
    .eq("id", comercioId)
    .maybeSingle();
  // Si la base no responde no se bloquea a nadie: cortar la caja de un comercio
  // al dia por un error nuestro es peor que dejar pasar una escritura.
  if (error) return COMPLETO;
  if (!data) return { nivel: "solo_lectura", motivo: "baja" };

  // La demo publica nunca vence.
  const valor = data.slug === DEMO_SLUG ? COMPLETO : evaluarAcceso(data);
  cache.set(comercioId, { valor, hasta: Date.now() + CACHE_MS });
  return valor;
}

/** El superadmin cambio estado o prueba: que se aplique ya en esta instancia. */
export function olvidarAcceso(comercioId: string): void {
  cache.delete(comercioId);
}

const MENSAJES: Record<string, string> = {
  prueba_vencida: "Tu período de prueba terminó: el sistema quedó en modo consulta. Para volver a vender, contratá un plan.",
  suspendido: "El comercio está suspendido: el sistema quedó en modo consulta. Comunicate con nosotros para reactivarlo.",
  baja: "El comercio está dado de baja: el sistema quedó en modo consulta.",
};

export function mensajeSoloLectura(acceso: EstadoAcceso): string {
  return MENSAJES[acceso.motivo] ?? "El sistema está en modo consulta.";
}
