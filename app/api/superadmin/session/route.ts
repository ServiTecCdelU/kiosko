// app/api/superadmin/session/route.ts — datos del superadmin de la cookie actual.
// Puente entre el login server-side y el estado del cliente del panel
// /superadmin (que NO usa hooks/use-auth.ts: ese es el estado del tenant).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sesion = getSesion(req);
  if (!sesion?.superadmin) return NextResponse.json({ error: "Sin sesion" }, { status: 401 });
  return NextResponse.json({ email: sesion.usuarioId, nombre: sesion.nombre ?? sesion.usuarioId });
}
