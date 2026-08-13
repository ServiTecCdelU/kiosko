// app/api/clientes/pago/route.ts — abono a la cuenta corriente (server-only).
// Antes el navegador llamaba a la RPC directamente con el anon key, o sea que
// cualquiera con esa clave podia borrar deudas.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const clienteId = String(body?.clienteId ?? "");
  const monto = Number(body?.monto);

  if (!clienteId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto del pago debe ser mayor a cero" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("registrar_pago_cuenta", {
    p_cliente_id: clienteId,
    p_monto: monto,
    p_usuario: body?.usuario ?? null,
    p_referencia: body?.referencia ?? null,
    p_comercio_id: String(body?.comercioId ?? "comercio_1"),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    clienteId: data.cliente_id,
    saldoAnterior: Number(data.saldo_anterior) || 0,
    saldoNuevo: Number(data.saldo_nuevo) || 0,
  });
}
