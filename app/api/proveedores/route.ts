// app/api/proveedores/route.ts — alta y edicion de proveedores (server-only).
// POST -> crear | PATCH -> editar (nombre, telefono, notas, activo)
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { cuitValido } from "@/lib/afip/comprobante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CUIT opcional (58): solo digitos y con digito verificador correcto. */
function cuitDe(body: any): { cuit: string | null } | { error: string } {
  const crudo = String(body?.cuit ?? "").replace(/\D/g, "");
  if (!crudo) return { cuit: null };
  if (crudo.length !== 11 || !cuitValido(crudo)) return { error: "El CUIT no es válido (revisá los 11 números)" };
  return { cuit: crudo };
}

function mensajeDuplicado(error: any): string {
  if (error?.code !== "23505") return error.message;
  return String(error.message).includes("cuit") ? "Ya hay un proveedor con ese CUIT" : "Ya existe un proveedor con ese nombre";
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = comercioIdDeSesion(req);
  const nombre = String(body?.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  const c = cuitDe(body);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("proveedores")
    .insert({
      id: `prov_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      comercio_id: comercioId,
      nombre,
      telefono: String(body?.telefono ?? "").trim() || null,
      notas: String(body?.notas ?? "").trim() || null,
      cuit: c.cuit,
      activo: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: mensajeDuplicado(error) }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = comercioIdDeSesion(req);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el proveedor" }, { status: 400 });

  const cambios: Record<string, any> = {};
  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    cambios.nombre = nombre;
  }
  if (body?.telefono !== undefined) cambios.telefono = String(body.telefono).trim() || null;
  if (body?.notas !== undefined) cambios.notas = String(body.notas).trim() || null;
  if (body?.activo !== undefined) cambios.activo = Boolean(body.activo);
  if (body?.cuit !== undefined) {
    const c = cuitDe(body);
    if ("error" in c) return NextResponse.json({ error: c.error }, { status: 400 });
    cambios.cuit = c.cuit;
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("proveedores")
    .update(cambios)
    .eq("comercio_id", comercioId)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: mensajeDuplicado(error) }, { status: 400 });
  return NextResponse.json(data);
}
