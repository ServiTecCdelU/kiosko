// app/api/consultas/reportes/route.ts — reportes calculados en el servidor.
import { NextResponse } from "next/server";
import { calcularReporte } from "@/lib/server/reportes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (String(body?.accion ?? "") !== "reporte") {
    return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }

  const desde = new Date(String(body?.desde ?? ""));
  const hasta = new Date(String(body?.hasta ?? ""));
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return NextResponse.json({ error: "Rango de fechas invalido" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha desde no puede ser posterior a hasta" }, { status: 400 });
  }

  const topN = Math.min(Math.max(Number(body?.topN) || 10, 1), 100);

  try {
    const reporte = await calcularReporte(desde, hasta, topN, String(body?.comercioId ?? "comercio_1"));
    return NextResponse.json(reporte);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar el reporte" },
      { status: 400 },
    );
  }
}
