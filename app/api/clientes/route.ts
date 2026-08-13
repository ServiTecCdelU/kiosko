// app/api/clientes/route.ts — alta de clientes (server-only, service role).
// Antes se insertaba desde el navegador con el anon key.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generarIdLegible } from "@/lib/server/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const nombre = String(body?.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const limiteCredito = Number(body?.limiteCredito) || 0;
  if (limiteCredito < 0) {
    return NextResponse.json({ error: "El limite de credito no puede ser negativo" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const id = await generarIdLegible("clientes", "cli", nombre);

  const { data, error } = await supabaseAdmin
    .from("clientes")
    .insert({
      id,
      comercio_id: comercioId,
      nombre,
      telefono: String(body?.telefono ?? "").trim() || null,
      documento: String(body?.documento ?? "").trim() || null,
      limite_credito: limiteCredito,
      saldo: 0,
      notas: String(body?.notas ?? "").trim() || null,
      activo: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
