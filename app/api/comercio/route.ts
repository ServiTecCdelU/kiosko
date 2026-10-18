// app/api/comercio/route.ts — "Mi comercio": rubro, modulos del menu (lib/modulos.ts) y
// tienda online (lib/tienda.ts, plan Tienda).
// Solo el dueño (RUTAS_ADMIN en lib/permisos-api.ts). Se guardan en comercios.config,
// sin pisar el resto de la config (origen del alta, etc.).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { RUBROS } from "@/lib/registro";
import { modulosValidos } from "@/lib/modulos";
import { MENSAJE_TIENDA, planIncluyeTienda } from "@/lib/suscripcion";
import { configTiendaValida, numeroWhatsapp } from "@/lib/tienda";

/** Config actual (la tienda no viaja en la sesion). Sin WhatsApp cargado, se sugiere el del alta. */
export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const { data, error } = await supabaseAdmin
    .from("comercios")
    .select("slug, plan, config")
    .eq("id", comercioId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "El comercio no existe" }, { status: 404 });
  const tienda = configTiendaValida(data.config?.tienda);
  if (!tienda.whatsapp && typeof data.config?.telefono === "string") tienda.whatsapp = data.config.telefono;
  return NextResponse.json({
    slug: data.slug,
    rubro: data.config?.rubro ?? null,
    modulos: modulosValidos(data.config?.modulos),
    tienda,
    tiendaEnPlan: planIncluyeTienda(data.plan),
  });
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const comercioId = comercioIdDeSesion(req);

  const { data: actual, error: errorLeer } = await supabaseAdmin
    .from("comercios")
    .select("plan, config")
    .eq("id", comercioId)
    .maybeSingle();
  if (errorLeer) return NextResponse.json({ error: errorLeer.message }, { status: 400 });
  if (!actual) return NextResponse.json({ error: "El comercio no existe" }, { status: 404 });

  const config: Record<string, unknown> = { ...(actual.config ?? {}) };
  if (body?.rubro !== undefined) {
    if (!RUBROS.some((r) => r.id === body.rubro)) {
      return NextResponse.json({ error: "Rubro invalido" }, { status: 400 });
    }
    config.rubro = body.rubro;
  }
  // Se reemplaza entero: {} vuelve a lo que trae el rubro.
  if (body?.modulos !== undefined) config.modulos = modulosValidos(body.modulos);
  if (body?.tienda !== undefined) {
    const tienda = configTiendaValida(body.tienda);
    if (tienda.activa && !planIncluyeTienda(actual.plan)) {
      return NextResponse.json({ error: MENSAJE_TIENDA }, { status: 403 });
    }
    if (tienda.activa && !numeroWhatsapp(tienda.whatsapp)) {
      return NextResponse.json({ error: "Cargá un WhatsApp válido (con característica, ej. 343 456-7890) para recibir los pedidos" }, { status: 400 });
    }
    config.tienda = tienda;
  }

  const { error } = await supabaseAdmin.from("comercios").update({ config }).eq("id", comercioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, rubro: config.rubro ?? null, modulos: config.modulos ?? {}, tienda: configTiendaValida(config.tienda) });
}
