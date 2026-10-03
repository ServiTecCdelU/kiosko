// app/api/backup/route.ts — el admin descarga TODOS los datos de su comercio en
// un Excel (lib/server/backup.ts). Solo admin (proxy.ts). Es una lectura (GET),
// asi que anda aunque el comercio este en modo consulta: sus datos son suyos.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { generarBackup, respuestaBackup } from "@/lib/server/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un comercio grande tiene decenas de miles de filas: mas tiempo que el default.
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    return respuestaBackup(await generarBackup(comercioIdDeSesion(req)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el backup" }, { status: 500 });
  }
}
