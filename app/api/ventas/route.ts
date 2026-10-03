// app/api/ventas/route.ts — alta de venta atomica via RPC process_sale_kiosko
import { NextResponse, after } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { procesarVenta } from "@/lib/server/procesar-venta";
import { facturarSiEsAutomatico } from "@/lib/server/afip/facturar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];

  try {
    const comercioId = comercioIdDeSesion(req);
    const res = await procesarVenta({
      items: rawItems,
      paymentMethod: body?.paymentMethod ?? "efectivo",
      cashAmount: body?.cashAmount,
      changeAmount: body?.changeAmount,
      transferAmount: body?.transferAmount,
      discount: body?.discount,
      cajaId: body?.cajaId ?? null,
      userId: body?.userId ?? null,
      userName: body?.userName ?? null,
      clienteId: body?.clienteId ?? null,
      comercioId,
      pagadorNombre: body?.pagadorNombre ?? null,
      cuotas: body?.cuotas ?? null,
      recargoPct: body?.recargoPct ?? null,
      creditoMonto: body?.creditoMonto ?? null,
    });
    // Facturacion automatica (si el comercio la activo): despues de responder,
    // asi el cobro nunca espera a AFIP.
    after(() => facturarSiEsAutomatico(comercioId, res.id));
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo registrar la venta" }, { status: 400 });
  }
}
