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
  const puestoId = String(body?.puestoId ?? "");
  const montoApertura = Number(body?.montoApertura);
  if (!Number.isFinite(montoApertura) || montoApertura < 0) {
    return NextResponse.json({ error: "Monto de apertura invalido" }, { status: 400 });
  }
  if (!puestoId) return NextResponse.json({ error: "Falta elegir el puesto" }, { status: 400 });

  const { data: puesto, error: errorPuesto } = await supabaseAdmin
    .from("puestos")
    .select("id, activo")
    .eq("comercio_id", comercioId)
    .eq("id", puestoId)
    .maybeSingle();
  if (errorPuesto) return NextResponse.json({ error: errorPuesto.message }, { status: 400 });
  if (!puesto || !puesto.activo) {
    return NextResponse.json({ error: "El puesto no existe o esta inactivo" }, { status: 400 });
  }

  // Guardas de la app: una caja abierta por puesto y una por cajero. Aunque estas
  // verificaciones fallen, los indices unicos de 26_multi_caja.sql lo hacen
  // cumplir en la base; aca se traduce a un mensaje claro.
  // Se pide una lista y no maybeSingle(): ante cualquier duda se falla cerrando.
  const { data: abiertas, error: errorAbiertas } = await supabaseAdmin
    .from("caja")
    .select("id, puesto_id, abierta_por")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta");

  if (errorAbiertas) {
    return NextResponse.json(
      { error: "No se pudo verificar si hay una caja abierta" },
      { status: 500 },
    );
  }
  if ((abiertas ?? []).some((c) => c.puesto_id === puestoId)) {
    return NextResponse.json({ error: "El puesto ya tiene una caja abierta" }, { status: 409 });
  }
  const usuarioId = body?.usuarioId ?? null;
  if (usuarioId && (abiertas ?? []).some((c) => c.abierta_por === usuarioId)) {
    return NextResponse.json({ error: "Ya tenes una caja abierta a tu nombre" }, { status: 409 });
  }

  const id = await generarIdLegible("caja", "caja", new Date().toISOString().slice(0, 10));

  const { data, error } = await supabaseAdmin
    .from("caja")
    .insert({
      id,
      comercio_id: comercioId,
      estado: "abierta",
      puesto_id: puestoId,
      monto_apertura: montoApertura,
      abierta_por: usuarioId,
      abierta_por_nombre: body?.usuarioNombre ?? null,
      opened_at: new Date().toISOString(),
    })
    .select("*, puestos(nombre)")
    .single();

  if (error) {
    // 23505 = unique_violation: otro puesto/cajero gano la carrera de apertura.
    const msg = (error as any).code === "23505"
      ? "El puesto o el cajero ya tienen una caja abierta"
      : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }
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
    .select("*, puestos(nombre)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
