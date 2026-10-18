// app/api/consultas/produccion/route.ts — produccion del dia (lecturas).
//   estado -> productos elaborados en el local y sus movimientos de stock de los
//             ultimos N dias; los totales los arma lib/produccion.ts en la pantalla.
// Diseño: docs/superpowers/specs/2026-10-18-produccion-del-dia-design.md
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MOVIMIENTOS = 10_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.accion !== "estado") return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  const comercioId = comercioIdDeSesion(req);
  const dias = Math.min(Math.max(Math.trunc(Number(body?.dias) || 7), 1), 31);

  const { data: productos, error } = await supabaseAdmin
    .from("productos")
    .select("*")
    .eq("comercio_id", comercioId)
    .eq("elaboracion_propia", true)
    .eq("disabled", false)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = (productos ?? []).map((p) => p.id);
  if (ids.length === 0) return NextResponse.json({ productos: [], movimientos: [] });

  // Un dia de mas: el corte es en hora argentina y el servidor corre en UTC.
  const desde = new Date(Date.now() - (dias + 1) * 86_400_000).toISOString();
  const { data: movimientos, error: errorMovs } = await supabaseAdmin
    .from("stock_movimientos")
    .select("producto_id,tipo,cantidad,referencia,fecha")
    .eq("comercio_id", comercioId)
    .in("producto_id", ids)
    .in("tipo", ["entrada", "venta", "devolucion", "rotura"])
    .gte("fecha", desde)
    .order("fecha", { ascending: false })
    .limit(MAX_MOVIMIENTOS);
  if (errorMovs) return NextResponse.json({ error: errorMovs.message }, { status: 400 });

  return NextResponse.json({ productos, movimientos: movimientos ?? [] });
}
