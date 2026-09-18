// app/api/auth/logout/route.ts — borra la cookie de sesion firmada
import { NextResponse } from "next/server";
import { borrarCookieSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", borrarCookieSesion());
  return res;
}
