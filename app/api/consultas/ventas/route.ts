// app/api/consultas/ventas/route.ts — lecturas de ventas, stock y sincronizacion.
// Conjunto cerrado de acciones: el cliente no elige tablas ni filtros.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_MAX = 500;

function acotar(valor: unknown, porDefecto: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.floor(n), LIMITE_MAX);
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const accion = String(body?.accion ?? "");

  switch (accion) {
    case "ventaPorId": {
      const ventaId = String(body?.ventaId ?? "");
      if (!ventaId) return NextResponse.json({ error: "Falta la venta" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("ventas")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("id", ventaId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ venta: data ?? null });
    }

    case "ventasDeCaja": {
      const cajaId = String(body?.cajaId ?? "");
      if (!cajaId) return NextResponse.json({ error: "Falta la caja" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("ventas")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("caja_id", cajaId)
        .order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ventas: data ?? [] });
    }

    case "movimientosStock": {
      const productoId = String(body?.productoId ?? "");
      if (!productoId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("stock_movimientos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("producto_id", productoId)
        .order("fecha", { ascending: false })
        .limit(acotar(body?.limit, 30));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ movimientos: data ?? [] });
    }

    case "syncLogs": {
      const { data, error } = await supabaseAdmin
        .from("sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(acotar(body?.limit, 20));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ logs: data ?? [] });
    }

    case "productosCount": {
      const { count, error } = await supabaseAdmin
        .from("productos")
        .select("id", { count: "exact", head: true })
        .eq("comercio_id", comercioId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ count: count ?? 0 });
    }

    case "estadoPagoMP": {
      const externalReference = String(body?.externalReference ?? "");
      if (!externalReference) return NextResponse.json({ error: "Falta la referencia" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("pagos_mp_pendientes")
        .select("estado, venta_id, error_motivo")
        .eq("comercio_id", comercioId)
        .eq("external_reference", externalReference)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({
        estado: data?.estado ?? "pendiente",
        ventaId: data?.venta_id ?? null,
        errorMotivo: data?.error_motivo ?? null,
      });
    }

    /**
     * Cobros de Mercado Pago que necesitan atencion humana:
     *  - 'error'    : el pago entro pero la venta no se pudo registrar.
     *  - 'pendiente' viejos: se genero el cobro y nunca se confirmo ni cancelo.
     * Los pendientes recientes no se muestran: pueden estar en curso ahora mismo.
     */
    case "cobrosMPProblema": {
      const minutosGracia = 30;
      const corte = new Date(Date.now() - minutosGracia * 60 * 1000).toISOString();

      const { data, error } = await supabaseAdmin
        .from("pagos_mp_pendientes")
        .select("id, external_reference, payment_id, estado, error_motivo, sale_input, created_at, updated_at")
        .eq("comercio_id", comercioId)
        .or(`estado.eq.error,and(estado.eq.pendiente,created_at.lt.${corte})`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const cobros = (data ?? []).map((c: any) => ({
        id: c.id,
        externalReference: c.external_reference,
        paymentId: c.payment_id ?? null,
        estado: c.estado,
        errorMotivo: c.error_motivo ?? null,
        // Del carrito guardado solo interesa el monto, para reconocer el cobro.
        total: Number(c.sale_input?.transferAmount) || null,
        items: Array.isArray(c.sale_input?.items) ? c.sale_input.items.length : 0,
        createdAt: c.created_at,
      }));
      return NextResponse.json({ cobros });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
