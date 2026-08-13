// app/api/caja/route.ts — apertura y cierre de caja (server-only, service role).
// POST  -> abrir caja
// PATCH -> cerrar caja (el arqueo se recalcula aca, no se confia en el cliente)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generarIdLegible } from "@/lib/server/ids";
import { calcularResumenCaja } from "@/lib/server/caja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const montoApertura = Number(body?.montoApertura);
  if (!Number.isFinite(montoApertura) || montoApertura < 0) {
    return NextResponse.json({ error: "Monto de apertura invalido" }, { status: 400 });
  }

  // No puede haber dos cajas abiertas a la vez.
  const { data: abierta } = await supabaseAdmin
    .from("caja")
    .select("id")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta")
    .maybeSingle();
  if (abierta) return NextResponse.json({ error: "Ya hay una caja abierta" }, { status: 409 });

  const id = await generarIdLegible("caja", "caja", new Date().toISOString().slice(0, 10));

  const { data, error } = await supabaseAdmin
    .from("caja")
    .insert({
      id,
      comercio_id: comercioId,
      estado: "abierta",
      monto_apertura: montoApertura,
      abierta_por: body?.usuarioId ?? null,
      abierta_por_nombre: body?.usuarioNombre ?? null,
      opened_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const cajaId = String(body?.cajaId ?? "");
  const montoCierreContado = Number(body?.montoCierreContado);

  if (!cajaId) return NextResponse.json({ error: "Falta la caja" }, { status: 400 });
  if (!Number.isFinite(montoCierreContado) || montoCierreContado < 0) {
    return NextResponse.json({ error: "Monto contado invalido" }, { status: 400 });
  }

  // El monto de apertura se lee de la base, no del cliente: es parte del arqueo.
  const { data: caja, error: cajaError } = await supabaseAdmin
    .from("caja")
    .select("id,estado,monto_apertura")
    .eq("comercio_id", comercioId)
    .eq("id", cajaId)
    .maybeSingle();

  if (cajaError) return NextResponse.json({ error: cajaError.message }, { status: 400 });
  if (!caja) return NextResponse.json({ error: "La caja no existe" }, { status: 404 });
  if (caja.estado !== "abierta") {
    return NextResponse.json({ error: "La caja ya esta cerrada" }, { status: 409 });
  }

  const resumen = await calcularResumenCaja(cajaId, comercioId);
  const montoApertura = Number(caja.monto_apertura) || 0;

  // Arqueo real: lo que abrio + lo vendido en efectivo + aportes − retiros − gastos.
  const esperadoEfectivo =
    montoApertura + resumen.totalEfectivo + resumen.totalAportes - resumen.totalRetiros - resumen.totalGastos;
  const diferencia = montoCierreContado - esperadoEfectivo;

  const { data, error } = await supabaseAdmin
    .from("caja")
    .update({
      estado: "cerrada",
      monto_cierre: montoCierreContado,
      total_efectivo: resumen.totalEfectivo,
      total_transferencia: resumen.totalTransferencia,
      total_mercadopago: resumen.totalMercadoPago,
      total_ventas: resumen.totalVentas,
      cantidad_ventas: resumen.cantidadVentas,
      total_retiros: resumen.totalRetiros,
      total_aportes: resumen.totalAportes,
      total_gastos: resumen.totalGastos,
      diferencia,
      cerrada_por: body?.usuarioId ?? null,
      notas: body?.notas ?? null,
      closed_at: new Date().toISOString(),
    })
    .eq("comercio_id", comercioId)
    .eq("id", cajaId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
