// app/api/mercadopago/dispositivos/route.ts — lista los lectores Point vinculados a la cuenta
import { NextResponse } from "next/server";
import { listarDispositivosMP } from "@/lib/server/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dispositivos = await listarDispositivosMP();
    return NextResponse.json({ dispositivos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
