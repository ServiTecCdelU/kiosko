// app/api/afip/reintentar/route.ts — reintenta una factura o nota de credito que
// quedo con error (AFIP caido, corte de red). Si AFIP ya la habia autorizado,
// la recupera sin duplicarla (lib/server/afip/facturar.ts).
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { reintentar } from "@/lib/server/afip/facturar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const facturaId = String((await req.json().catch(() => null))?.facturaId ?? "");
  if (!facturaId) return NextResponse.json({ error: "Falta la factura" }, { status: 400 });
  try {
    return NextResponse.json({ factura: await reintentar(comercioIdDeSesion(req), facturaId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo reintentar" }, { status: 400 });
  }
}
