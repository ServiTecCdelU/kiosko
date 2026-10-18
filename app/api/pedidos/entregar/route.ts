// app/api/pedidos/entregar/route.ts — entrega de un pedido de la tienda YA PAGADO online
// (plan Tienda, etapa 3). Registra la venta al precio que pago el cliente, como cobrada
// por Mercado Pago, en la caja de quien entrega, y deja el pedido entregado.
// Lo de por kg se entrega con el peso pedido (el cliente ya lo pago).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { procesarVentaDePedidoPagado } from "@/lib/server/procesar-venta";
import { ERROR_SIN_CAJA } from "@/lib/venta-validacion";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const comercioId = comercioIdDeSesion(req);
  const sesion = getSesion(req);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el pedido" }, { status: 400 });

  const { data: pedido, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, numero, estado, pago_estado, items, total")
    .eq("comercio_id", comercioId)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!pedido) return NextResponse.json({ error: "El pedido no existe" }, { status: 404 });
  if (pedido.pago_estado !== "aprobado") {
    return NextResponse.json({ error: "Este pedido no está pagado online: cobralo con Pasar a venta" }, { status: 409 });
  }
  if (!["nuevo", "preparando", "listo"].includes(pedido.estado)) {
    return NextResponse.json({ error: `El pedido ya está ${pedido.estado}` }, { status: 409 });
  }

  // Caja de quien entrega; si no tiene una propia y hay una sola abierta, esa.
  const { data: cajas, error: errorCajas } = await supabaseAdmin
    .from("caja").select("id, abierta_por").eq("comercio_id", comercioId).eq("estado", "abierta");
  if (errorCajas) return NextResponse.json({ error: errorCajas.message }, { status: 400 });
  const propia = (cajas ?? []).find((c) => c.abierta_por === sesion?.usuarioId);
  const cajaId = propia?.id ?? ((cajas ?? []).length === 1 ? cajas![0].id : null);
  if (!cajaId) {
    return NextResponse.json(
      { error: (cajas ?? []).length > 1 ? "Abrí tu caja para registrar la entrega (hay varias abiertas)" : ERROR_SIN_CAJA },
      { status: 409 },
    );
  }

  const items = (Array.isArray(pedido.items) ? pedido.items : []) as { productId: string; name: string; quantity: number; subtotal: number }[];
  const subtotales = new Map(items.map((i) => [String(i.productId), Number(i.subtotal)]));
  const total = Math.round(items.reduce((s, i) => s + Number(i.subtotal), 0) * 100) / 100;

  try {
    const venta = await procesarVentaDePedidoPagado(
      {
        comercioId,
        items: items.map((i) => ({ productId: i.productId, name: i.name, quantity: Number(i.quantity) })),
        // Como el cobro con QR: Mercado Pago entra en el arqueo como transferencia.
        paymentMethod: "mercadopago",
        cashAmount: 0,
        changeAmount: 0,
        transferAmount: total,
        cajaId,
        userId: sesion?.usuarioId ?? null,
        userName: (sesion as { nombre?: string } | null)?.nombre ?? null,
        pedidoId: pedido.id,
      },
      subtotales,
    );
    return NextResponse.json({ ok: true, ventaId: venta.id, saleNumber: venta.saleNumber, total: venta.total });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo registrar la entrega" }, { status: 400 });
  }
}
