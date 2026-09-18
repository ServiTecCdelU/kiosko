// app/api/imprimir-ticket/route.ts — arma el ZPL de un ticket y lo manda RAW a la Zebra
import { NextResponse } from "next/server";
import { generarZPL } from "@/lib/server/zpl";
import { imprimirZPL } from "@/lib/server/imprimir-zpl";
import type { TicketData } from "@/components/pos/ticket-print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Ticket invalido" }, { status: 400 });
  }

  const ticket: TicketData = {
    saleNumber: String(body.saleNumber ?? ""),
    createdAt: new Date(body.createdAt ?? Date.now()),
    items: body.items,
    total: Number(body.total ?? 0),
    paymentMethod: body.paymentMethod ?? "efectivo",
    cashAmount: Number(body.cashAmount ?? 0),
    changeAmount: Number(body.changeAmount ?? 0),
    userName: body.userName ?? undefined,
    pagadorNombre: body.pagadorNombre ?? undefined,
    cuotas: body.cuotas ?? undefined,
    recargoPct: body.recargoPct ?? undefined,
  };

  try {
    const zpl = generarZPL(ticket);
    await imprimirZPL(zpl);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo imprimir" }, { status: 500 });
  }
}
