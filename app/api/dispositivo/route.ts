// app/api/dispositivo/route.ts — "¿que PC es esta?" para la pantalla de login
// ("Super Patricia · Caja 1"). Publica (todavia no hay sesion): solo responde
// con la cookie de la PC, y solo nombres de SU comercio y SU caja.
import { NextResponse } from "next/server";
import { dispositivoDe } from "@/lib/server/dispositivo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pc = await dispositivoDe(req);
  if (!pc) return NextResponse.json({ registrada: false });
  return NextResponse.json({ registrada: true, comercio: pc.comercioNombre, caja: pc.puestoNombre, nombre: pc.nombre });
}
