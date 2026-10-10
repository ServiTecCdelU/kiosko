// app/api/imprimir-ticket/prueba/route.ts — ticket fijo para calibrar ALTO_POR_LINEA a mano.
// Abrir esta URL en el navegador (GET) manda el ticket de prueba a la Zebra RAW
// (solo funciona con la app corriendo en la misma PC que la impresora).
import { NextResponse } from "next/server";
import { generarZPL } from "@/lib/server/zpl";
import { imprimirZPL } from "@/lib/server/imprimir-zpl";
import { ticketDePrueba } from "@/lib/impresora/ticket-prueba";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const zpl = generarZPL(ticketDePrueba());
    await imprimirZPL(zpl);
    return NextResponse.json({ ok: true, zpl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo imprimir" }, { status: 500 });
  }
}
