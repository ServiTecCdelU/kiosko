// app/api/clientes/pago/route.ts — abono a la cuenta corriente (server-only).
// Antes el navegador llamaba a la RPC directamente con el anon key, o sea que
// cualquiera con esa clave podia borrar deudas.
//
// Un cobro en efectivo entra al cajon: se registra como aporte en la caja
// abierta, si no el arqueo de cierre lo da como sobrante. Por transferencia
// no toca la caja.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Caja abierta donde entra el efectivo: la del usuario, o la unica abierta del comercio. */
async function cajaParaCobro(comercioId: string, usuarioId: string | null): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("caja")
    .select("id, abierta_por")
    .eq("comercio_id", comercioId)
    .eq("estado", "abierta")
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  const abiertas = data ?? [];
  const propia = usuarioId ? abiertas.find((c) => c.abierta_por === usuarioId) : undefined;
  if (propia) return propia.id;
  return abiertas.length === 1 ? abiertas[0].id : null;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const clienteId = String(body?.clienteId ?? "");
  const monto = Math.round(Number(body?.monto) * 100) / 100;
  const medio = body?.medio === "transferencia" ? "transferencia" : "efectivo";

  if (!clienteId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto del pago debe ser mayor a cero" }, { status: 400 });
  }

  const comercioId = comercioIdDeSesion(req);
  const sesion = getSesion(req);

  // La caja se resuelve ANTES de tocar la deuda: sin caja abierta no se cobra en efectivo.
  let cajaId: string | null = null;
  if (medio === "efectivo") {
    try {
      cajaId = await cajaParaCobro(comercioId, sesion?.usuarioId ?? null);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer la caja" }, { status: 500 });
    }
    if (!cajaId) {
      return NextResponse.json(
        { error: "Para cobrar en efectivo abrí tu caja (o elegí transferencia)" },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabaseAdmin.rpc("registrar_pago_cuenta", {
    p_cliente_id: clienteId,
    p_monto: monto,
    p_usuario: body?.usuario ?? null,
    p_referencia: body?.referencia ?? (medio === "transferencia" ? "Transferencia" : "Efectivo"),
    p_comercio_id: comercioId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let avisoCaja: string | null = null;
  if (cajaId) {
    const { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("nombre")
      .eq("comercio_id", comercioId)
      .eq("id", clienteId)
      .maybeSingle();
    const { error: errorMov } = await supabaseAdmin.rpc("registrar_movimiento_caja", {
      p_caja_id: cajaId,
      p_comercio_id: comercioId,
      p_tipo: "aporte",
      p_monto: monto,
      p_concepto: `Cobro de fiado${cliente?.nombre ? `: ${cliente.nombre}` : ""}`,
      p_usuario_id: sesion?.usuarioId ?? null,
      p_usuario_nombre: sesion?.nombre ?? body?.usuario ?? null,
      p_categoria: null,
    });
    // El pago ya quedo en la cuenta: no se revierte, se avisa para cargarlo a mano.
    if (errorMov) avisoCaja = "El pago se registró pero no entró a la caja: cargalo como aporte";
  }

  return NextResponse.json({
    clienteId: data.cliente_id,
    saldoAnterior: Number(data.saldo_anterior) || 0,
    saldoNuevo: Number(data.saldo_nuevo) || 0,
    avisoCaja,
  });
}
