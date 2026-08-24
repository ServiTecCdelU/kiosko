// lib/server/procesar-venta.ts — logica compartida de alta de venta (server-only, usa service role)
// La usan /api/ventas (cobro directo) y /api/mercadopago/webhook (cobro con QR confirmado).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { precioLinea } from "@/lib/pricing";

export interface ProcesarVentaInput {
  items: { productId: string; name?: string; quantity: number; price?: number }[];
  paymentMethod: string;
  cashAmount?: number;
  changeAmount?: number;
  transferAmount?: number;
  discount?: number;
  cajaId?: string | null;
  userId?: string | null;
  userName?: string | null;
  clienteId?: string | null;
  comercioId: string;
  pagadorNombre?: string | null;
  cuotas?: number | null;
  /** % de recargo por cuotas (Credito): se suma al total autoritativo calculado aca. */
  recargoPct?: number | null;
  /** Mixto: monto (sin recargo) de la parte que va por Credito, para aplicarle el recargo solo a esa porcion. */
  creditoMonto?: number | null;
}

export interface ProcesarVentaResult {
  id: string;
  saleNumber: string;
  total: number;
}

/** Recalcula precios/subtotales autoritativos desde la BD e inserta la venta via RPC atomica. */
export async function procesarVenta(input: ProcesarVentaInput): Promise<ProcesarVentaResult> {
  const rawItems = input.items;
  if (rawItems.length === 0) {
    throw new Error("El carrito esta vacio");
  }

  const comercioId = input.comercioId;
  const ids = rawItems.map((i) => String(i.productId)).filter(Boolean);
  const { data: prods, error: prodErr } = await supabaseAdmin
    .from("productos")
    .select("id,name,price,oferta_activa,oferta_tipo,oferta_valor,oferta_cantidad")
    .eq("comercio_id", comercioId)
    .in("id", ids);
  if (prodErr) throw new Error(prodErr.message);
  const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));

  const items = rawItems.map((i) => {
    const id = String(i.productId);
    const db = byId.get(id);
    const quantity = Number(i.quantity) || 0;
    const subtotal = db
      ? precioLinea(
          {
            price: Number(db.price),
            ofertaActiva: db.oferta_activa,
            ofertaTipo: db.oferta_tipo,
            ofertaValor: db.oferta_valor,
            ofertaCantidad: db.oferta_cantidad,
          },
          quantity,
        )
      : (Number(i.price) || 0) * quantity;
    const name = db ? db.name : String(i.name ?? "");
    const price = quantity > 0 ? subtotal / quantity : 0;
    return { productId: id, name, quantity, price, subtotal };
  });

  const discount = Number(input.discount) || 0;
  const subtotal = Math.max(0, items.reduce((s, i) => s + i.subtotal, 0) - discount);

  // El recargo por cuotas se calcula aca, nunca se confia en un total
  // mandado por el navegador. Solo existe para Credito (recargo sobre todo
  // el total) y para la porcion a credito de un Mixto (recargo solo sobre
  // esa porcion, no sobre el efectivo).
  let cashAmount = Number(input.cashAmount) || 0;
  let transferAmount = Number(input.transferAmount) || 0;
  let total = subtotal;
  let recargoPct = 0;

  if (input.paymentMethod === "credito") {
    recargoPct = Math.max(0, Number(input.recargoPct) || 0);
    cashAmount = 0;
    transferAmount = Math.round(subtotal * (1 + recargoPct / 100) * 100) / 100;
    total = transferAmount;
  } else if (input.paymentMethod === "mixto") {
    // Mixto reparte el total en dos partes con metodo propio cada una (ej:
    // transferencia + credito, o credito + debito). Solo la porcion que se
    // paga a credito lleva recargo; creditoMonto es esa porcion SIN recargo.
    cashAmount = Math.max(0, Math.min(cashAmount, subtotal));
    const restoSinRecargo = subtotal - cashAmount;
    recargoPct = Math.max(0, Number(input.recargoPct) || 0);
    const creditoBase = Math.max(0, Math.min(Number(input.creditoMonto) || 0, restoSinRecargo));
    const recargoMonto = creditoBase * (recargoPct / 100);
    transferAmount = Math.round((restoSinRecargo + recargoMonto) * 100) / 100;
    total = Math.round((subtotal + recargoMonto) * 100) / 100;
  } else if (input.paymentMethod === "transferencia" || input.paymentMethod === "debito") {
    cashAmount = 0;
    transferAmount = subtotal;
    total = subtotal;
  } else {
    // efectivo, fiado, mercadopago, mercadopago_point, tarjeta: sin recargo,
    // se respeta lo que mando el cliente para cash/transfer (efectivo puede
    // superar el total por el vuelto).
    total = subtotal;
  }

  const { data, error } = await supabaseAdmin.rpc("process_sale_kiosko", {
    p_items: items,
    p_total: total,
    p_payment_method: input.paymentMethod ?? "efectivo",
    p_cash_amount: cashAmount,
    p_change_amount: Number(input.changeAmount) || 0,
    p_transfer_amount: transferAmount,
    p_discount: discount,
    p_caja_id: input.cajaId ?? null,
    p_user_id: input.userId ?? null,
    p_user_name: input.userName ?? null,
    p_cliente_id: input.clienteId ?? null,
    p_comercio_id: comercioId,
    p_pagador_nombre: input.pagadorNombre ?? null,
    p_cuotas: input.cuotas ?? null,
    p_recargo_pct: recargoPct,
  });

  if (error) throw new Error(error.message);

  return { id: data.id, saleNumber: data.sale_number, total: data.total };
}
