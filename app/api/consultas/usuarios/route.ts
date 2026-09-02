// app/api/consultas/usuarios/route.ts — lectura de usuarios.
// Conjunto cerrado de acciones: el cliente no elige tablas ni filtros.
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

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const accion = String(body?.accion ?? "");

  switch (accion) {
    case "listar": {
      const { data, error } = await supabaseAdmin
        .from("usuarios")
        .select("id, comercio_id, nombre, rol, activo, created_at")
        .eq("comercio_id", comercioId)
        .order("created_at", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ usuarios: data ?? [] });
    }
    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
