// app/api/superadmin/backup/route.ts — el superadmin descarga el backup de
// cualquier comercio (?id=...). Mismo Excel que ve el dueño (lib/server/backup.ts).
import { NextResponse } from "next/server";
import { esSuperadmin } from "@/lib/server/sesion";
import { generarBackup, respuestaBackup } from "@/lib/server/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!esSuperadmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
  try {
    return respuestaBackup(await generarBackup(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el backup" }, { status: 500 });
  }
}
