// app/api/billing/debito/route.ts — debito automatico con Mercado Pago (solo admin).
// POST crea la suscripcion y devuelve el link para autorizarla · DELETE la cancela.
// Pasa en modo consulta (lib/acceso-comercio.ts esLectura): para salir del
// bloqueo por falta de pago hay que poder activar el debito.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { cancelarDebito, crearDebito } from "@/lib/server/billing-debito";
import { olvidarAcceso } from "@/lib/server/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) return NextResponse.json({ error: "La demo no tiene suscripción." }, { status: 403 });
    const sesion = getSesion(req);
    const { data: u } = await supabaseAdmin.from("usuarios").select("email").eq("id", sesion?.usuarioId ?? "").maybeSingle();
    return NextResponse.json(await crearDebito(comercioId, u?.email ?? null));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo activar el débito" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    await cancelarDebito(comercioId);
    olvidarAcceso(comercioId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cancelar el débito" }, { status: 400 });
  }
}
