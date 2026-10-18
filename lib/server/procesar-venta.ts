// lib/server/procesar-venta.ts — logica compartida de alta de venta (server-only, usa service role)
// La usan /api/ventas (cobro directo) y /api/mercadopago/webhook (cobro con QR confirmado).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { precioLinea } from "@/lib/pricing";
import { ERROR_SIN_CAJA, errorCantidad, errorDescuento, errorPrecioLibre } from "@/lib/venta-validacion";
import { estaVigente, preciosPresupuestados, subtotalConPresupuesto } from "@/lib/presupuesto";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";

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
  /** Venta que sale de un presupuesto: si sigue vigente se respetan sus precios. */
  presupuestoId?: string | null;
  /** Mixto: parte que queda en la cuenta corriente del cliente ("el resto anotamelo"). */
  fiadoMonto?: number | null;
  /** Mixto: monto (con recargo) que se paso por el posnet, debito y/o credito. Para separar tarjeta en el arqueo. */
  tarjetaMonto?: number | null;
}

export interface ProcesarVentaResult {
  id: string;
  saleNumber: string;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo que se valida ANTES de cobrar con Mercado Pago (QR o Point) y en el cobro
 * directo: que haya caja abierta del comercio y que la venta sea valida. Asi
 * nunca se cobra una venta que despues el servidor rechaza.
 */
export async function validarVenta(input: ProcesarVentaInput): Promise<void> {
  await validarCaja(input.comercioId, input.cajaId);
  await prepararVenta(input);
}

/** Toda venta va a una caja abierta del comercio: sin caja no entra en ningun cierre. */
export async function validarCaja(comercioId: string, cajaId: string | null | undefined): Promise<void> {
  if (!cajaId) throw new Error(ERROR_SIN_CAJA);
  const { data, error } = await supabaseAdmin
    .from("caja")
    .select("id")
    .eq("comercio_id", comercioId)
    .eq("id", cajaId)
    .eq("estado", "abierta")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(ERROR_SIN_CAJA);
}

/** Recalcula precios/subtotales autoritativos desde la BD e inserta la venta via RPC atomica. */
export async function procesarVenta(input: ProcesarVentaInput): Promise<ProcesarVentaResult> {
  const { tarjetaAmount, ...params } = await prepararVenta(input);
  const { data, error } = await supabaseAdmin.rpc("process_sale_kiosko", params);
  if (error) throw new Error(error.message);
  // La RPC no conoce la columna (61_tarjeta_aparte.sql): se completa despues.
  // Si falla la venta igual quedo bien; solo esa parte se veria como transferencia.
  if (tarjetaAmount > 0) {
    const { error: errorTarjeta } = await supabaseAdmin
      .from("ventas")
      .update({ tarjeta_amount: tarjetaAmount })
      .eq("comercio_id", input.comercioId)
      .eq("id", data.id);
    if (errorTarjeta) console.error("[ventas] tarjeta_amount:", errorTarjeta.message);
  }
  // El presupuesto queda vendido (solo si seguia vigente: no revive uno anulado).
  if (input.presupuestoId) {
    const { error: errorPresu } = await supabaseAdmin
      .from("presupuestos")
      .update({ estado: "vendido", venta_id: data.id, updated_at: new Date().toISOString() })
      .eq("comercio_id", input.comercioId)
      .eq("id", input.presupuestoId)
      .eq("estado", "vigente");
    if (errorPresu) console.error("[ventas] presupuesto vendido:", errorPresu.message);
  }
  return { id: data.id, saleNumber: data.sale_number, total: data.total };
}

/**
 * Lineas con precio autoritativo (de la base, ofertas, precio libre). La usan la
 * venta y el presupuesto. Con `presupuestados` (presupuesto vigente) cada producto
 * presupuestado se cobra al menor entre hoy y lo prometido (lib/presupuesto.ts).
 */
export async function calcularLineas(
  comercioId: string,
  rawItems: ProcesarVentaInput["items"],
  presupuestados?: Map<string, number>,
): Promise<{ productId: string; name: string; quantity: number; price: number; subtotal: number; unidad: string }[]> {
  if (rawItems.length === 0) {
    throw new Error("El carrito esta vacio");
  }
  const ids = rawItems.map((i) => String(i.productId)).filter(Boolean);
  const { data: prods, error: prodErr } = await supabaseAdmin
    .from("productos")
    // "*" y no una lista: oferta_desde/oferta_hasta (34_oferta_vigencia.sql) pueden
    // no existir todavia en la base, y pedirlas por nombre romperia todas las ventas.
    .select("*")
    .eq("comercio_id", comercioId)
    .in("id", ids);
  if (prodErr) throw new Error(prodErr.message);
  const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));

  return rawItems.map((i) => {
    const id = String(i.productId);
    const db = byId.get(id);
    if (!db) throw new Error(`${String(i.name ?? "Un producto")} ya no existe en el catalogo`);
    const quantity = Number(i.quantity);
    const errorCant = errorCantidad(quantity, db.unidad, db.name);
    if (errorCant) throw new Error(errorCant);
    // Precio libre (64_precio_libre.sql: recargas, "varios"): el importe lo pone el
    // POS. Solo para productos marcados asi; el resto siempre usa el precio de la base.
    let subtotal: number;
    if (db.precio_libre === true) {
      const precio = Number(i.price);
      const errorPrecio = errorPrecioLibre(precio, db.name);
      if (errorPrecio) throw new Error(errorPrecio);
      subtotal = round2(precio * quantity);
    } else {
      subtotal = precioLinea(
        {
          price: Number(db.price),
          ofertaActiva: db.oferta_activa,
          ofertaTipo: db.oferta_tipo,
          ofertaValor: db.oferta_valor,
          ofertaCantidad: db.oferta_cantidad,
          ofertaDesde: db.oferta_desde ?? null,
          ofertaHasta: db.oferta_hasta ?? null,
        },
        quantity,
      );
    }
    if (presupuestados && db.precio_libre !== true) {
      subtotal = subtotalConPresupuesto(subtotal, presupuestados.get(id), quantity);
    }
    const name = db.name;
    // Precio unitario informativo (el total sale de subtotal): a centavos, sin 1349.9999.
    const price = round2(subtotal / quantity);
    return { productId: id, name, quantity, price, subtotal, unidad: String(db.unidad ?? "un") };
  });
}

/** Precios del presupuesto si es del comercio y sigue vigente; si no, undefined (precio de hoy). */
async function preciosDelPresupuesto(comercioId: string, presupuestoId: string | null | undefined) {
  if (!presupuestoId) return undefined;
  const { data } = await supabaseAdmin
    .from("presupuestos")
    .select("estado,vence,items")
    .eq("comercio_id", comercioId)
    .eq("id", presupuestoId)
    .maybeSingle();
  if (!data || !estaVigente(data.estado, data.vence, hoyArgentinaISO())) return undefined;
  return preciosPresupuestados(Array.isArray(data.items) ? data.items : []);
}

/** Precios, totales y recargos autoritativos; tira error si la venta no es valida. */
async function prepararVenta(input: ProcesarVentaInput) {
  const comercioId = input.comercioId;
  const presupuestados = await preciosDelPresupuesto(comercioId, input.presupuestoId);
  // La unidad no va a la venta: ventas.items queda como siempre.
  const items = (await calcularLineas(comercioId, input.items, presupuestados))
    .map(({ unidad: _unidad, ...linea }) => linea);

  const discount = Number(input.discount) || 0;
  const bruto = items.reduce((s, i) => s + i.subtotal, 0);
  const errorDesc = errorDescuento(discount, bruto);
  if (errorDesc) throw new Error(errorDesc);
  // Redondeo a centavos: sumar subtotales ya redondeados igual deja basura de coma
  // flotante (3 x 299.7 = 899.0999999999999), y AFIP exige 2 decimales.
  const subtotal = round2(Math.max(0, bruto - discount));

  // El recargo por cuotas se calcula aca, nunca se confia en un total
  // mandado por el navegador. Solo existe para Credito (recargo sobre todo
  // el total) y para la porcion a credito de un Mixto (recargo solo sobre
  // esa porcion, no sobre el efectivo).
  let cashAmount = Number(input.cashAmount) || 0;
  let transferAmount = Number(input.transferAmount) || 0;
  let total = subtotal;
  let recargoPct = 0;
  let tarjetaAmount = 0;
  let fiadoAmount = 0;

  if (input.paymentMethod === "credito") {
    recargoPct = Math.max(0, Number(input.recargoPct) || 0);
    cashAmount = 0;
    transferAmount = Math.round(subtotal * (1 + recargoPct / 100) * 100) / 100;
    total = transferAmount;
    tarjetaAmount = total;
  } else if (input.paymentMethod === "mixto") {
    // Mixto reparte el total en dos partes con metodo propio cada una (ej:
    // transferencia + credito, o credito + debito). Solo la porcion que se
    // paga a credito lleva recargo; creditoMonto es esa porcion SIN recargo.
    cashAmount = Math.max(0, Math.min(cashAmount, subtotal));
    // Parte a fiado (67_mixto_con_fiado.sql): va a la cuenta corriente, sin recargo.
    // La RPC exige cliente y controla su limite de credito.
    fiadoAmount = round2(Math.max(0, Math.min(Number(input.fiadoMonto) || 0, subtotal - cashAmount)));
    const restoSinRecargo = round2(subtotal - cashAmount - fiadoAmount);
    recargoPct = Math.max(0, Number(input.recargoPct) || 0);
    const creditoBase = Math.max(0, Math.min(Number(input.creditoMonto) || 0, restoSinRecargo));
    const recargoMonto = creditoBase * (recargoPct / 100);
    transferAmount = Math.round((restoSinRecargo + recargoMonto) * 100) / 100;
    total = Math.round((subtotal + recargoMonto) * 100) / 100;
    // Lo que fue por posnet: al menos la parte a credito (con su recargo), que se
    // conoce aca; la de debito la informa el POS. Nunca mas que lo no efectivo.
    const creditoConRecargo = round2(creditoBase + recargoMonto);
    tarjetaAmount = round2(Math.min(transferAmount, Math.max(creditoConRecargo, Number(input.tarjetaMonto) || 0)));
  } else if (input.paymentMethod === "transferencia" || input.paymentMethod === "debito") {
    cashAmount = 0;
    transferAmount = subtotal;
    total = subtotal;
    if (input.paymentMethod === "debito") tarjetaAmount = total;
  } else {
    // efectivo, fiado, mercadopago, mercadopago_point, tarjeta: sin recargo,
    // se respeta lo que mando el cliente para cash/transfer (efectivo puede
    // superar el total por el vuelto).
    total = subtotal;
  }

  if (input.paymentMethod === "tarjeta") tarjetaAmount = total;

  return {
    tarjetaAmount,
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
    p_fiado_monto: fiadoAmount,
  };
}
