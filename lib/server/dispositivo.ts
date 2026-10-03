// lib/server/dispositivo.ts — la PC registrada de este request (server-only).
// La cookie solo dice "soy la PC X del comercio Y"; aca se confirma contra la
// base que siga activa, que sea de ese comercio y que su caja exista.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCookieDispositivo } from "@/lib/server/sesion";

export interface DispositivoRegistrado {
  id: string;
  nombre: string;
  comercioId: string;
  comercioNombre: string;
  puestoId: string;
  puestoNombre: string;
}

export async function dispositivoDe(req: Request): Promise<DispositivoRegistrado | null> {
  const cookie = getCookieDispositivo(req);
  if (!cookie) return null;
  const { data, error } = await supabaseAdmin
    .from("dispositivos")
    .select("id, nombre, comercio_id, puesto_id, activo, puestos(nombre, activo), comercios(nombre)")
    .eq("id", cookie.id)
    .eq("comercio_id", cookie.comercioId)
    .maybeSingle();
  if (error || !data || !data.activo) return null;
  const puesto = data.puestos as unknown as { nombre: string; activo: boolean } | null;
  const comercio = data.comercios as unknown as { nombre: string } | null;
  if (!puesto?.activo || !comercio) return null;
  return {
    id: data.id,
    nombre: data.nombre,
    comercioId: data.comercio_id,
    comercioNombre: comercio.nombre,
    puestoId: data.puesto_id,
    puestoNombre: puesto.nombre,
  };
}
