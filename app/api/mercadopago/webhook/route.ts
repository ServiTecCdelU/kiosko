// app/api/mercadopago/webhook/route.ts — Mercado Pago avisa aca cuando cambia el estado de un pago.
// Recien cuando esta 'approved' se registra la venta real (process_sale_kiosko).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPagoMP } from "@/lib/server/mercadopago";
import { comerciosDeCuentaMP, MPNoConectado, tokenMPDeComercio } from "@/lib/server/mercadopago-credencial";
import { procesarVenta } from "@/lib/server/procesar-venta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extraerPaymentId(url: URL, body: any): string | null {
  const fromQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (fromQuery) return fromQuery;
  if (body?.data?.id) return String(body.data.id);
  return null;
}

async function comerciosDelAviso(url: URL, body: any): Promise<string[]> {
  const comercio = url.searchParams.get("comercio");
  if (comercio) return [comercio];
  const cuenta = body?.user_id ?? url.searchParams.get("user_id");
  return cuenta ? comerciosDeCuentaMP(String(cuenta)) : [];
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // algunas notificaciones de MP llegan sin body, solo query params
  }

  const paymentId = extraerPaymentId(url, body);
  const tipo = url.searchParams.get("type") ?? body?.type;
  if (!paymentId || tipo !== "payment") {
    return NextResponse.json({ ok: true }); // notificacion no relevante, se responde 200 igual
  }

  // De que comercio es el pago: el QR lo manda en la URL; Point avisa a la URL
  // fija de la cuenta, asi que ahi sale de la cuenta de MP que cobro (user_id).
  const comercios = await comerciosDelAviso(url, body);
  if (comercios.length === 0) return NextResponse.json({ ok: true }); // no es de ningun comercio conectado

  let token: string;
  try {
    token = await tokenMPDeComercio(comercios[0]);
  } catch (e) {
    // Comercio desconectado: reintentar no lo arregla. Queda el cobro
    // pendiente para resolverlo a mano desde Caja.
    if (e instanceof MPNoConectado) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }

  try {
    // Con el token del comercio MP solo devuelve pagos de SU cuenta: un aviso
    // falso no puede hacer pasar el pago de otra cuenta como propio.
    const pago = await getPagoMP(token, paymentId);
    if (!pago.externalReference) return NextResponse.json({ ok: true });

    const { data: pendiente, error: findErr } = await supabaseAdmin
      .from("pagos_mp_pendientes")
      .select("*")
      .in("comercio_id", comercios)
      .eq("external_reference", pago.externalReference)
      .maybeSingle();
    if (findErr || !pendiente) return NextResponse.json({ ok: true });
    if (pendiente.estado !== "pendiente") return NextResponse.json({ ok: true }); // ya procesado, evita duplicar

    if (pago.status === "approved") {
      // El pago YA entro. Si no se puede registrar la venta (sin stock, caja
      // cerrada, etc.) no alcanza con fallar: hay que dejar constancia, porque
      // si no queda plata cobrada sin venta y nadie se entera.
      let venta;
      try {
        venta = await procesarVenta(pendiente.sale_input);
      } catch (e) {
        const motivo = e instanceof Error ? e.message : "error desconocido";
        await supabaseAdmin
          .from("pagos_mp_pendientes")
          .update({
            estado: "error",
            payment_id: pago.id,
            error_motivo: motivo,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendiente.id);
        // 200 a proposito: reintentar no sirve (el motivo no se arregla solo) y
        // dejaria a MP notificando en loop. El caso queda marcado para resolver
        // a mano: devolver el pago o cargar la venta.
        return NextResponse.json({ ok: true, registrado: false, motivo });
      }

      await supabaseAdmin
        .from("pagos_mp_pendientes")
        .update({ estado: "aprobado", payment_id: pago.id, venta_id: venta.id, updated_at: new Date().toISOString() })
        .eq("id", pendiente.id);
    } else if (pago.status === "rejected" || pago.status === "cancelled") {
      await supabaseAdmin
        .from("pagos_mp_pendientes")
        .update({ estado: pago.status === "rejected" ? "rechazado" : "cancelado", payment_id: pago.id, updated_at: new Date().toISOString() })
        .eq("id", pendiente.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Devolvemos 500 para que Mercado Pago reintente la notificacion mas tarde.
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
