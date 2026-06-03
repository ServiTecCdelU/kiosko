// app/api/auth/login/route.ts — login por PIN (server-side, no expone la tabla)
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

  const pin = String(body?.pin ?? "").trim();
  if (!pin) return NextResponse.json({ error: "Ingresa el PIN" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select("id,nombre,rol,activo,pin")
    .eq("pin", pin)
    .eq("activo", true)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });

  return NextResponse.json({ id: data.id, nombre: data.nombre, rol: data.rol });
}
