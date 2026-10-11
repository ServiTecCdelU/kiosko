// app/api/clientes/importar/route.ts — importacion masiva de clientes desde
// Excel o CSV. El navegador parsea el archivo y manda las filas por lotes;
// las escrituras ocurren aca con el service role. Solo admin (lib/permisos-api.ts).
import { NextResponse } from "next/server";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { importarLoteClientes, type ClienteImportacion, type EstrategiaClientes } from "@/lib/server/importar-clientes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESTRATEGIAS: EstrategiaClientes[] = ["solo_nuevos", "actualizar"];
const MAX_FILAS_POR_LOTE = 300;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const filas = body?.filas;
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: "No hay clientes para importar" }, { status: 400 });
  }
  if (filas.length > MAX_FILAS_POR_LOTE) {
    return NextResponse.json({ error: `El lote no puede superar los ${MAX_FILAS_POR_LOTE} clientes` }, { status: 413 });
  }
  const estrategia = String(body?.estrategia) as EstrategiaClientes;
  if (!ESTRATEGIAS.includes(estrategia)) {
    return NextResponse.json({ error: "Opcion invalida para los clientes existentes" }, { status: 400 });
  }

  const limpias: ClienteImportacion[] = filas.map((f: any) => ({
    nombre: String(f?.nombre ?? "").trim().slice(0, 120),
    telefono: String(f?.telefono ?? "").trim().slice(0, 40),
    documento: String(f?.documento ?? "").trim().slice(0, 20),
    limiteCredito: Math.max(0, Number(f?.limiteCredito) || 0),
    saldo: Math.max(0, Number(f?.saldo) || 0),
    notas: String(f?.notas ?? "").trim().slice(0, 500),
  }));

  try {
    const resumen = await importarLoteClientes(limpias, comercioIdDeSesion(req), estrategia, getSesion(req)?.nombre ?? "Importación");
    return NextResponse.json(resumen);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo importar el lote" }, { status: 400 });
  }
}
