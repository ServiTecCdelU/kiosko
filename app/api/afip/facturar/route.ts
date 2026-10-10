// app/api/afip/facturar/route.ts — factura de una venta (boton "Facturar" del
// POS y de Ventas). Cualquier rol con sesion: el cajero factura en modo manual.
// Un emisor inscripto emite A o B segun la condicion del cliente (opcional).
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { facturarVenta } from "@/lib/server/afip/facturar";
import { esCondicionReceptor } from "@/lib/afip/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ventaId = String(body?.ventaId ?? "");
  if (!ventaId) return NextResponse.json({ error: "Falta la venta" }, { status: 400 });
  const documento = typeof body?.documento === "string" ? body.documento.slice(0, 20) : null;
  const condicion = esCondicionReceptor(body?.condicion) ? body.condicion : null;
  try {
    return NextResponse.json({ factura: await facturarVenta(comercioIdDeSesion(req), ventaId, documento, condicion) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo facturar" }, { status: 400 });
  }
}
