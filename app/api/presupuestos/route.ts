// app/api/presupuestos/route.ts — presupuestos del mostrador (cualquier rol con sesion).
// POST  -> crear (precios calculados aca, como en la venta)
// PATCH -> anular (solo uno vigente)
// Diseño: docs/superpowers/specs/2026-10-18-presupuestos-design.md
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { calcularLineas } from "@/lib/server/procesar-venta";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";
import { VALIDEZ_DEFAULT, errorValidez, venceEl } from "@/lib/presupuesto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 300;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = comercioIdDeSesion(req);
  const rawItems = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS + 1) : [];
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Un presupuesto admite hasta ${MAX_ITEMS} productos` }, { status: 400 });
  }
  const validezDias = body?.validezDias === undefined ? VALIDEZ_DEFAULT : Number(body.validezDias);
  const errorDias = errorValidez(validezDias);
  if (errorDias) return NextResponse.json({ error: errorDias }, { status: 400 });

  try {
    const lineas = await calcularLineas(comercioId, rawItems);
    const total = Math.round(lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
    const hoy = hoyArgentinaISO();
    const id = `presu_${randomUUID().replace(/-/g, "")}`;

    const { data, error } = await supabaseAdmin.rpc("crear_presupuesto", {
      p_comercio_id: comercioId,
      p_id: id,
      p_cliente_id: body?.clienteId ? String(body.clienteId) : null,
      p_cliente_nombre: body?.clienteNombre ? String(body.clienteNombre).slice(0, 120) : null,
      p_items: lineas,
      p_total: total,
      p_validez_dias: validezDias,
      p_vence: venceEl(hoy, validezDias),
      p_notas: body?.notas ? String(body.notas).slice(0, 500) : null,
      p_creado_por_nombre: getSesion(req)?.nombre ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: presupuesto } = await supabaseAdmin
      .from("presupuestos").select("*").eq("comercio_id", comercioId).eq("id", data.id).single();
    return NextResponse.json({ presupuesto });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el presupuesto" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el presupuesto" }, { status: 400 });
  if (body?.accion !== "anular") return NextResponse.json({ error: "Accion invalida" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("presupuestos")
    .update({ estado: "anulado", updated_at: new Date().toISOString() })
    .eq("comercio_id", comercioIdDeSesion(req))
    .eq("id", id)
    .eq("estado", "vigente")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Solo se puede anular un presupuesto vigente" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
