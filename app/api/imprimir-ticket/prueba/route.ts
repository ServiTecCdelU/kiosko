// app/api/imprimir-ticket/prueba/route.ts — ticket fijo para calibrar ALTO_POR_LINEA a mano.
// Abrir esta URL en el navegador (GET) manda el ticket de prueba a la impresora RAW.
import { NextResponse } from "next/server";
import { generarZPL } from "@/lib/server/zpl";
import { imprimirZPL } from "@/lib/server/imprimir-zpl";
import type { TicketData } from "@/components/pos/ticket-print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_PRUEBA: TicketData = {
  saleNumber: "0000-PRUEBA",
  createdAt: new Date(),
  items: [
    { name: "Coca Cola 500ml", quantity: 2, price: 1200, subtotal: 2400, unidad: "un" },
    { name: "Fideos Matarazzo 500g", quantity: 1, price: 900, subtotal: 900, unidad: "un" },
    { name: "Queso cremoso (fiambreria)", quantity: 0.35, price: 8000, subtotal: 2800, unidad: "kg" },
    { name: "Pan lactal", quantity: 1, price: 2100, subtotal: 2100, unidad: "un" },
    { name: "Yerba Playadito 1kg", quantity: 1, price: 4300, subtotal: 4300, unidad: "un" },
  ],
  total: 12500,
  paymentMethod: "efectivo",
  cashAmount: 15000,
  changeAmount: 2500,
  userName: "Cajero Prueba",
};

export async function GET() {
  try {
    const zpl = generarZPL(TICKET_PRUEBA);
    await imprimirZPL(zpl);
    return NextResponse.json({ ok: true, zpl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo imprimir" }, { status: 500 });
  }
}
