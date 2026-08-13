// app/api/productos/auditoria/route.ts — registro de cambios de precio.
// Va por el servidor para que la auditoria no se pueda falsear ni borrar
// desde el navegador con el anon key.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const productId = String(body?.productId ?? "");
  const campo = String(body?.campo ?? "");
  if (!productId || !campo) {
    return NextResponse.json({ error: "Faltan datos de la auditoria" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("producto_auditoria").insert({
    id: crypto.randomUUID(),
    comercio_id: String(body?.comercioId ?? "comercio_1"),
    producto_id: productId,
    campo,
    valor_anterior: String(body?.valorAnterior ?? ""),
    valor_nuevo: String(body?.valorNuevo ?? ""),
    usuario_nombre: body?.usuarioNombre ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
