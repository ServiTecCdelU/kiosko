// app/api/consultas/comercio/route.ts — lecturas del comercio que necesita el mostrador
// (cualquier rol). Editar va por /api/comercio, que es solo del dueño.
//   ticket -> logo, nombre, direccion, telefono y CUIT del encabezado del ticket
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { leerDatosTicket } from "@/lib/server/datos-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const body = await req.json().catch(() => null);
  try {
    if (body?.accion === "ticket") return NextResponse.json({ ticket: await leerDatosTicket(comercioId) });
    return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
