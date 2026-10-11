// app/api/compras/route.ts — recepcion de mercaderia via RPC recibir_compra_kiosko
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { leerQrAfip, type ComprobanteAfip } from "@/lib/afip/qr-comprobante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const compraSchema = z.object({
  proveedorId: z.string().min(1, "Falta el proveedor"),
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        cantidad: z.number().positive("La cantidad debe ser mayor a cero"),
        costoUnitario: z.number().min(0, "El costo no puede ser negativo"),
        // Crea un lote de vencimiento para ese item (migracion 46).
        fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de vencimiento invalida").optional(),
      }),
    ),
  /** QR de la factura electronica del proveedor: con el, la compra puede ir sin items (solo cuenta corriente). */
  qrAfip: z.string().optional(),
  remito: z.string().optional(),
  condicion: z.enum(["contado", "cuenta_corriente"]).default("contado"),
  pagada: z.boolean().default(true),
  /** Fecha pactada de pago (YYYY-MM-DD) para los recordatorios de cuenta corriente. */
  vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de pago invalida").optional().nullable(),
  notas: z.string().optional(),
  usuarioId: z.string().optional(),
  usuarioNombre: z.string().optional(),
});

/** PATCH: cambiar (o borrar) la fecha pactada de pago de una compra del comercio. */
export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const compraId = String(body?.compraId ?? "");
  if (!compraId) return NextResponse.json({ error: "Falta la compra" }, { status: 400 });
  const vence = body?.vence == null || body.vence === "" ? null : String(body.vence);
  if (vence !== null && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) {
    return NextResponse.json({ error: "Fecha de pago invalida" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("compras")
    .update({ vence })
    .eq("comercio_id", comercioIdDeSesion(req))
    .eq("id", compraId)
    .eq("estado", "recibida")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Compra inexistente o anulada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = compraSchema.safeParse(body);
  if (!parsed.success) {
    const detalle = parsed.error.issues[0]?.message ?? "Datos invalidos";
    return NextResponse.json({ error: detalle }, { status: 400 });
  }
  const input = parsed.data;
  const comercioId = comercioIdDeSesion(req);

  // Factura electronica (58): se vuelve a leer el QR aca para no confiar en lo que mando el navegador.
  let comprobante: ComprobanteAfip | null = null;
  if (input.qrAfip) {
    const lectura = leerQrAfip(input.qrAfip);
    if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 });
    if (lectura.comprobante.esNotaCredito) {
      return NextResponse.json({ error: `Es una ${lectura.comprobante.nombreTipo}: no se carga como compra` }, { status: 400 });
    }
    comprobante = lectura.comprobante;
  }
  if (input.items.length === 0 && !comprobante) {
    return NextResponse.json({ error: "La compra no tiene items" }, { status: 400 });
  }
  const remito = input.remito?.trim() || comprobante?.nombre || null;
  const datosFactura = comprobante
    ? {
        clave: comprobante.clave, cuit: comprobante.cuit, tipo: comprobante.tipo, nombreTipo: comprobante.nombreTipo,
        numero: comprobante.numero, fecha: comprobante.fecha, importe: comprobante.importe, cae: comprobante.cae, moneda: comprobante.moneda,
      }
    : null;
  const errorFactura = (e: { code?: string; message: string }) =>
    NextResponse.json({ error: e.code === "23505" ? "Esa factura ya está cargada en una compra" : e.message }, { status: 400 });

  // Solo cabecera: la factura va a cuenta corriente sin tocar stock (los productos se cargan despues o nunca).
  if (input.items.length === 0 && comprobante) {
    const { data: prov, error: errorProv } = await supabaseAdmin
      .from("proveedores").select("id").eq("comercio_id", comercioId).eq("id", input.proveedorId).eq("activo", true).maybeSingle();
    if (errorProv) return NextResponse.json({ error: errorProv.message }, { status: 400 });
    if (!prov) return NextResponse.json({ error: "Proveedor inexistente o inactivo" }, { status: 400 });
    const compraId = `compra_${comprobante.fecha.replace(/-/g, "")}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const { error } = await supabaseAdmin.from("compras").insert({
      id: compraId,
      comercio_id: comercioId,
      proveedor_id: input.proveedorId,
      estado: "recibida",
      remito,
      condicion: input.condicion,
      pagada: input.pagada,
      pagado: input.pagada ? comprobante.importe : 0,
      total: comprobante.importe,
      notas: input.notas?.trim() || null,
      usuario_id: input.usuarioId ?? null,
      usuario_nombre: input.usuarioNombre ?? null,
      vence: !input.pagada && input.vence ? input.vence : null,
      comprobante_afip: datosFactura,
    });
    if (error) return errorFactura(error as any);
    return NextResponse.json({ compraId, total: comprobante.importe, items: 0 });
  }

  const { data, error } = await supabaseAdmin.rpc("recibir_compra_kiosko", {
    p_comercio_id: comercioId,
    p_proveedor_id: input.proveedorId,
    p_items: input.items,
    p_remito: remito,
    p_condicion: input.condicion,
    p_pagada: input.pagada,
    p_notas: input.notas?.trim() || null,
    p_usuario_id: input.usuarioId ?? null,
    p_usuario_nombre: input.usuarioNombre ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const compraId = data?.compraId ? String(data.compraId) : null;

  // La RPC no conoce la fecha de pago ni la factura (su firma es anterior): se guardan aparte.
  // Con factura, la deuda es el total de la factura (IVA y percepciones incluidos), no la suma de items.
  const cambios: Record<string, unknown> = {};
  if (input.vence && !input.pagada) cambios.vence = input.vence;
  if (comprobante) {
    cambios.comprobante_afip = datosFactura;
    cambios.total = comprobante.importe;
    cambios.pagado = input.pagada ? comprobante.importe : 0;
  }
  if (compraId && Object.keys(cambios).length > 0) {
    const { error: errorCambios } = await supabaseAdmin.from("compras").update(cambios).eq("comercio_id", comercioId).eq("id", compraId);
    if (errorCambios) {
      // Factura repetida: se deshace la compra (y el stock) para no dejarla a medias.
      await supabaseAdmin.rpc("anular_compra_kiosko", { p_compra_id: compraId, p_comercio_id: comercioId, p_usuario_id: input.usuarioId ?? null });
      return errorFactura(errorCambios as any);
    }
  }
  return NextResponse.json(comprobante ? { ...data, total: comprobante.importe } : data);
}
