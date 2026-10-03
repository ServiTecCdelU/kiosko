// app/api/acceso/route.ts — estado de acceso del comercio de la sesion, para el
// cartel de prueba / solo lectura (components/layout/aviso-acceso-banner.tsx).
// El bloqueo real lo hace proxy.ts; esto solo informa.
import { NextResponse } from "next/server";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { accesoDeComercio } from "@/lib/server/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const acceso = await accesoDeComercio(comercioIdDeSesion(req));
  return NextResponse.json({ ...acceso, soporte: getSesion(req)?.soporte === true });
}
