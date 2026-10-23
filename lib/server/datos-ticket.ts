// lib/server/datos-ticket.ts — datos del negocio para el encabezado del ticket.
// Lo cargado en Mi comercio (comercios.config.ticket) le gana; lo que falta se
// completa con el nombre del comercio y los datos de AFIP.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { datosTicketValidos, type DatosTicket } from "@/lib/ticket-negocio";

export async function leerDatosTicket(comercioId: string): Promise<DatosTicket> {
  const [comercio, afip] = await Promise.all([
    supabaseAdmin.from("comercios").select("nombre, config").eq("id", comercioId).maybeSingle(),
    supabaseAdmin.from("afip_config").select("cuit, domicilio").eq("comercio_id", comercioId).maybeSingle(),
  ]);
  if (comercio.error) throw new Error(comercio.error.message);
  const guardado = datosTicketValidos(comercio.data?.config?.ticket);
  if (comercio.data?.config?.ticket) return { ...guardado, nombre: guardado.nombre || comercio.data?.nombre || "" };
  // Nunca cargado: sugerencia a partir de lo que ya se sabe del comercio.
  return datosTicketValidos({
    nombre: comercio.data?.nombre,
    direccion: afip.data?.domicilio,
    cuit: afip.data?.cuit,
  });
}
