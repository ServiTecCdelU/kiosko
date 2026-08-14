// app/api/mercadopago/resolver/route.ts — cerrar a mano un cobro de MP que
// quedo sin resolver (pago entrado sin venta, o cobro colgado).
// No toca plata: solo deja constancia de que alguien ya se ocupo.
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
  const id = String(body?.id ?? "");
  const nota = String(body?.nota ?? "").trim();

  if (!id) return NextResponse.json({ error: "Falta el cobro" }, { status: 400 });

  const { data: cobro, error: buscarError } = await supabaseAdmin
    .from("pagos_mp_pendientes")
    .select("id, estado")
    .eq("comercio_id", comercioId)
    .eq("id", id)
    .maybeSingle();

  if (buscarError) return NextResponse.json({ error: buscarError.message }, { status: 400 });
  if (!cobro) return NextResponse.json({ error: "No se encontro el cobro" }, { status: 404 });

  // Un cobro aprobado ya tiene su venta: no hay nada que resolver.
  if (cobro.estado === "aprobado") {
    return NextResponse.json({ error: "Ese cobro ya tiene su venta registrada" }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("pagos_mp_pendientes")
    .update({
      estado: "resuelto",
      resuelto_nota: nota || null,
      updated_at: new Date().toISOString(),
    })
    .eq("comercio_id", comercioId)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
