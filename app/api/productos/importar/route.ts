// app/api/productos/importar/route.ts — importacion masiva de productos.
// El cliente parsea el Excel y manda las filas por lotes; las escrituras
// ocurren aca con el service role.
import { NextResponse } from "next/server";
import { importarLote, type EstrategiaStock, type FilaImportacion } from "@/lib/server/importar-productos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESTRATEGIAS: EstrategiaStock[] = ["reemplazar", "sumar", "mantener", "solo_nuevos"];
const MAX_FILAS_POR_LOTE = 500;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const filas = body?.filas;
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: "No hay filas para importar" }, { status: 400 });
  }
  if (filas.length > MAX_FILAS_POR_LOTE) {
    return NextResponse.json(
      { error: `El lote no puede superar las ${MAX_FILAS_POR_LOTE} filas` },
      { status: 413 },
    );
  }

  const estrategia = String(body?.estrategia) as EstrategiaStock;
  if (!ESTRATEGIAS.includes(estrategia)) {
    return NextResponse.json({ error: "Estrategia de stock invalida" }, { status: 400 });
  }

  try {
    const resumen = await importarLote(
      filas as FilaImportacion[],
      String(body?.comercioId ?? "comercio_1"),
      estrategia,
    );
    return NextResponse.json(resumen);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo importar el lote" },
      { status: 400 },
    );
  }
}
