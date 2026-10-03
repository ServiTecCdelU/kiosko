// app/api/sync/route.ts — sincroniza el catalogo de la distribuidora en EL COMERCIO
// de la sesion (solo admin, proxy.ts). Antes iba fijo a comercio_1: cualquier
// admin de otro comercio le pisaba el catalogo a comercio_1.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { syncProductosFromDistribuidora } from "@/services/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const result = await syncProductosFromDistribuidora(comercioIdDeSesion(req));
  const status = result.estado === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}
