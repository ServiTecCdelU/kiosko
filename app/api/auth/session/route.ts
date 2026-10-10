// app/api/auth/session/route.ts — datos del usuario de la cookie firmada actual.
// Puente entre el login server-side (PIN o Google) y el estado del cliente
// (hooks/use-auth.ts guarda en sessionStorage). Se re-consulta la fila de
// `usuarios` en vez de confiar solo en lo que dice la cookie, por si el admin
// desactivo o cambio de rol al usuario despues de emitida.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { patronCorreoExacto } from "@/lib/correo";
import { getSesion } from "@/lib/server/sesion";
import { datosDeComercio } from "@/lib/server/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sesion = getSesion(req);
  if (!sesion) return NextResponse.json({ error: "Sin sesion" }, { status: 401 });

  // Superadmin adentro de un comercio: no es una fila de `usuarios`. Se
  // re-verifica que siga siendo superadmin y que el comercio exista.
  if (sesion.soporte && sesion.superadmin) {
    const [{ data: sa }, { data: comercio }] = await Promise.all([
      supabaseAdmin.from("superadmins").select("email").ilike("email", patronCorreoExacto(sesion.usuarioId)).maybeSingle(),
      supabaseAdmin.from("comercios").select("id, nombre, slug, plan").eq("id", sesion.comercioId).maybeSingle(),
    ]);
    if (!sa || !comercio) return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });
    return NextResponse.json({
      id: `soporte:${sesion.usuarioId}`,
      nombre: `Soporte · ${sesion.nombre ?? sesion.usuarioId}`,
      rol: "admin",
      comercioId: comercio.id,
      soporte: true,
      comercioNombre: comercio.nombre,
      comercioSlug: comercio.slug,
      plan: comercio.plan,
    });
  }

  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, rol, comercio_id, activo, debe_cambiar_pin")
    .eq("id", sesion.usuarioId)
    .eq("comercio_id", sesion.comercioId)
    .maybeSingle();

  if (error || !usuario || !usuario.activo) {
    return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });
  }

  return NextResponse.json({
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    comercioId: usuario.comercio_id,
    ...(await datosDeComercio(usuario.comercio_id)),
    debeCambiarPin: usuario.debe_cambiar_pin === true,
  });
}
