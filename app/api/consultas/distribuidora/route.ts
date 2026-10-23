// app/api/consultas/distribuidora/route.ts — pantalla "Distribuidora": stock de los
// dos lados (lib/server/distribuidora-stock.ts). Solo el comercio vinculado.
//   stock -> productos de la distribuidora con stock del comercio y de la distribuidora
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { estaVinculado, verStock } from "@/lib/server/distribuidora-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const body = await req.json().catch(() => null);
  try {
    if (!(await estaVinculado(comercioId))) {
      return NextResponse.json({ error: "Este comercio no está vinculado a la distribuidora" }, { status: 403 });
    }
    if (body?.accion === "stock") return NextResponse.json(await verStock(comercioId));
    return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
