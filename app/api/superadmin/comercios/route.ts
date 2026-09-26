// app/api/superadmin/comercios/route.ts — panel de superadmin: ver y
// administrar TODOS los comercios del SaaS. Cruza el aislamiento normal de
// comercio_id a proposito, por eso cada handler exige esSuperadmin(req)
// antes de tocar nada.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { esSuperadmin } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESTADOS = ["activo", "prueba", "suspendido", "baja"];
const PLANES = ["free", "basico", "pro"];

async function contar(tabla: string, comercioId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from(tabla)
    .select("id", { count: "exact", head: true })
    .eq("comercio_id", comercioId);
  return count ?? 0;
}

export async function POST(req: Request) {
  if (!esSuperadmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const accion = String(body?.accion ?? "");

  if (accion === "listar") {
    const { data: comercios, error } = await supabaseAdmin
      .from("comercios")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Pocos comercios en la practica (SaaS chico): una consulta de conteo por
    // tabla y por comercio es aceptable; no vale la pena una vista SQL todavia.
    const conUso = await Promise.all(
      (comercios ?? []).map(async (c: any) => ({
        ...c,
        uso: {
          productos: await contar("productos", c.id),
          ventas: await contar("ventas", c.id),
          usuarios: await contar("usuarios", c.id),
        },
      })),
    );

    return NextResponse.json({ comercios: conUso });
  }

  if (accion === "crear") {
    const nombre = String(body?.nombre ?? "").trim();
    const slugInput = String(body?.slug ?? "").trim().toLowerCase();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    const slug = slugInput || nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) return NextResponse.json({ error: "No se pudo generar el slug" }, { status: 400 });

    const trialDias = Number(body?.trialDias) || 14;
    const { data, error } = await supabaseAdmin
      .from("comercios")
      .insert({
        id: `comercio_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        nombre,
        slug,
        estado: "prueba",
        plan: "free",
        trial_hasta: new Date(Date.now() + trialDias * 86400_000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      const msg = (error as any).code === "23505" ? "Ya existe un comercio con ese slug" : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ comercio: data });
  }

  return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
}

export async function PATCH(req: Request) {
  if (!esSuperadmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });

  const cambios: Record<string, any> = {};
  if (body?.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
    cambios.estado = body.estado;
  }
  if (body?.plan !== undefined) {
    if (!PLANES.includes(body.plan)) return NextResponse.json({ error: "Plan invalido" }, { status: 400 });
    cambios.plan = body.plan;
  }
  if (body?.trialHasta !== undefined) {
    cambios.trial_hasta = body.trialHasta || null;
  }
  if (body?.suscripcionHasta !== undefined) {
    cambios.suscripcion_hasta = body.suscripcionHasta || null;
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("comercios")
    .update(cambios)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comercio: data });
}
