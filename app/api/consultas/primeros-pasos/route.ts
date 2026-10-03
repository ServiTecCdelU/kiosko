// app/api/consultas/primeros-pasos/route.ts — checklist del comercio nuevo
// (components/home/primeros-pasos-card.tsx). Solo lecturas: cada paso se
// tilda solo cuando ya paso. Se muestra en comercios dados de alta por el
// autoregistro (40_autoregistro.sql); los demas ya estaban andando.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hay(tabla: string, comercioId: string, filtro?: (q: any) => any): Promise<boolean> {
  let q = supabaseAdmin.from(tabla).select("id", { count: "exact", head: true }).eq("comercio_id", comercioId);
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    const { data: comercio, error } = await supabaseAdmin
      .from("comercios")
      .select("config, mp_token_cifrado")
      .eq("id", comercioId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const [productos, venta, cajeros] = await Promise.all([
      hay("productos", comercioId),
      hay("ventas", comercioId),
      hay("usuarios", comercioId, (q) => q.neq("rol", "admin").eq("activo", true)),
    ]);

    return NextResponse.json({
      mostrar: comercio?.config?.origen === "autoregistro",
      pasos: { productos, venta, cajeros, mercadoPago: !!comercio?.mp_token_cifrado },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
