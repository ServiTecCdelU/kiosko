// app/api/dispositivos/route.ts — PCs registradas del comercio (solo admin, proxy.ts).
// GET    lista (y cual es esta PC)
// POST   {puestoId, nombre} registra ESTA PC en esa caja (deja la cookie en la PC)
// DELETE {id} la da de baja: el PIN deja de funcionar en ella al instante
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  borrarCookieDispositivo, comercioIdDeSesion, crearCookieDispositivo, getCookieDispositivo, getSesion,
} from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fallo = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const { data, error } = await supabaseAdmin
    .from("dispositivos")
    .select("id, nombre, puesto_id, created_at, ultimo_uso, puestos(nombre)")
    .eq("comercio_id", comercioId)
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (error) return fallo(error.message, 500);
  const esta = getCookieDispositivo(req);
  return NextResponse.json({
    dispositivos: (data ?? []).map((d: any) => ({
      id: d.id,
      nombre: d.nombre,
      puestoId: d.puesto_id,
      puestoNombre: d.puestos?.nombre ?? "",
      createdAt: d.created_at,
      ultimoUso: d.ultimo_uso,
      esEsta: esta?.id === d.id && esta?.comercioId === comercioId,
    })),
  });
}

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  if (await esComercioDemo(comercioId)) return fallo("En la demo no se registran PCs", 403);
  const body = await req.json().catch(() => null);
  const puestoId = String(body?.puestoId ?? "");
  const nombre = String(body?.nombre ?? "").trim().slice(0, 60) || "PC del mostrador";
  if (!puestoId) return fallo("Elegí la caja de esta PC");

  const { data: puesto } = await supabaseAdmin
    .from("puestos").select("id, activo").eq("comercio_id", comercioId).eq("id", puestoId).maybeSingle();
  if (!puesto?.activo) return fallo("Esa caja no existe o está desactivada");

  // Si esta PC ya estaba registrada (en este comercio), se reemplaza: no quedan dos filas para la misma PC.
  const previa = getCookieDispositivo(req);
  if (previa?.comercioId === comercioId) {
    await supabaseAdmin.from("dispositivos").update({ activo: false }).eq("id", previa.id).eq("comercio_id", comercioId);
  }

  const id = `pc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { error } = await supabaseAdmin.from("dispositivos").insert({
    id, comercio_id: comercioId, puesto_id: puestoId, nombre, creado_por: getSesion(req)?.usuarioId ?? null,
  });
  if (error) return fallo(error.message, 500);

  const res = NextResponse.json({ ok: true, id });
  res.headers.append("Set-Cookie", crearCookieDispositivo(id, comercioId));
  return res;
}

export async function DELETE(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const id = String((await req.json().catch(() => null))?.id ?? "");
  if (!id) return fallo("Falta la PC");
  const { data, error } = await supabaseAdmin
    .from("dispositivos").update({ activo: false }).eq("comercio_id", comercioId).eq("id", id).select("id");
  if (error) return fallo(error.message, 500);
  if (!data?.length) return fallo("No se encontró la PC", 404);

  const res = NextResponse.json({ ok: true });
  if (getCookieDispositivo(req)?.id === id) res.headers.append("Set-Cookie", borrarCookieDispositivo());
  return res;
}
