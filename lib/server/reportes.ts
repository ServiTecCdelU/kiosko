// lib/server/reportes.ts — calculo de reportes (server-only, service role).
// Estaba en services/reportes-service.ts corriendo en el navegador con el
// anon key: leia todas las ventas del periodo, los costos de los productos y
// los gastos de caja. Ahora se calcula aca y al cliente solo le llega el
// resultado agregado.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  Reporte,
  ProductoVendido,
  RubroRentabilidad,
  VentaDia,
  ResumenReporte,
} from "@/services/reportes-service";

function localDay(iso: string): string {
  // YYYY-MM-DD en zona local
  return new Date(iso).toLocaleDateString("en-CA");
}

interface ProductoAcum {
  productId: string;
  name: string;
  cantidad: number;
  total: number;
  costo: number;
  sinCosto: number;
}

export async function calcularReporte(
  desde: Date,
  hasta: Date,
  topN: number,
  comercioId: string,
): Promise<Reporte> {
  const { data, error } = await supabaseAdmin
    .from("ventas")
    .select("total,payment_method,transfer_amount,items,created_at")
    .eq("comercio_id", comercioId)
    .eq("estado", "completada")
    .gte("created_at", desde.toISOString())
    .lte("created_at", hasta.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const ventas = data ?? [];
  let efectivo = 0;
  let transferencia = 0;
  let mercadoPago = 0;
  let fiado = 0;
  const dias = new Map<string, number>();
  const productos = new Map<string, ProductoAcum>();

  for (const v of ventas) {
    const total = Number(v.total) || 0;
    if (v.payment_method === "fiado") {
      fiado += total;
    } else if (v.payment_method === "mercadopago" || v.payment_method === "mercadopago_point") {
      // La plata de Mercado Pago no es efectivo del cajon ni una transferencia
      // bancaria: queda en la cuenta de MP, asi que se reporta aparte.
      mercadoPago += total;
    } else {
      // En 'mixto' se divide segun la porcion transferida; el resto es efectivo.
      const tr =
        ["transferencia", "tarjeta"].includes(v.payment_method)
          ? total
          : v.payment_method === "mixto"
            ? Math.min(total, Number(v.transfer_amount) || 0)
            : 0;
      transferencia += tr;
      efectivo += total - tr;
    }

    const dia = localDay(v.created_at);
    dias.set(dia, (dias.get(dia) ?? 0) + total);

    const items = Array.isArray(v.items) ? v.items : [];
    for (const it of items) {
      const id = String(it.productId ?? "");
      if (!id) continue;
      const prev = productos.get(id) ?? { productId: id, name: it.name ?? "", cantidad: 0, total: 0, costo: 0, sinCosto: 0 };
      const cantidad = Number(it.quantity) || 0;
      prev.cantidad += cantidad;
      prev.total += Number(it.subtotal) || (Number(it.price) || 0) * cantidad;
      productos.set(id, prev);
    }
  }

  // Costo actual por producto (no historico: si el costo cambio, el margen de ventas
  // viejas se calcula con el costo de hoy — aproximacion aceptable para un kiosko chico).
  const ids = Array.from(productos.keys());
  const costoPorId = new Map<string, number | undefined>();
  const rubroPorId = new Map<string, string>();
  if (ids.length > 0) {
    const { data: prods } = await supabaseAdmin
      .from("productos")
      .select("id,precio_base,category")
      .eq("comercio_id", comercioId)
      .in("id", ids);
    for (const p of prods ?? []) {
      costoPorId.set(p.id, p.precio_base != null ? Number(p.precio_base) : undefined);
      rubroPorId.set(p.id, p.category || "Sin rubro");
    }
  }

  let costoTotal = 0;
  let sinCostoCount = 0;
  const rubros = new Map<string, { total: number; costo: number }>();

  for (const p of productos.values()) {
    const costoUnit = costoPorId.get(p.productId);
    const costoLinea = costoUnit != null ? costoUnit * p.cantidad : 0;
    p.costo = costoLinea;
    p.sinCosto = costoUnit == null ? p.cantidad : 0;
    costoTotal += costoLinea;
    sinCostoCount += p.sinCosto;

    const rubro = rubroPorId.get(p.productId) ?? "Sin rubro";
    const r = rubros.get(rubro) ?? { total: 0, costo: 0 };
    r.total += p.total;
    r.costo += costoLinea;
    rubros.set(rubro, r);
  }

  const totalVentas = efectivo + transferencia + mercadoPago + fiado;
  const cantidad = ventas.length;
  const margenBruto = totalVentas - costoTotal;

  const { data: gastosData } = await supabaseAdmin
    .from("caja_movimientos")
    .select("monto")
    .eq("comercio_id", comercioId)
    .eq("tipo", "gasto")
    .gte("fecha", desde.toISOString())
    .lte("fecha", hasta.toISOString());
  const gastosTotal = (gastosData ?? []).reduce((s, m) => s + (Number(m.monto) || 0), 0);

  return {
    resumen: {
      totalVentas,
      cantidad,
      efectivo,
      transferencia,
      mercadoPago,
      fiado,
      ticketPromedio: cantidad > 0 ? totalVentas / cantidad : 0,
      costoTotal,
      margenBruto,
      margenPct: totalVentas > 0 ? (margenBruto / totalVentas) * 100 : 0,
      sinCosto: sinCostoCount,
      gastosTotal,
      gananciaNeta: margenBruto - gastosTotal,
    },
    porDia: Array.from(dias.entries())
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    masVendidos: Array.from(productos.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, topN)
      .map((p) => ({
        productId: p.productId,
        name: p.name,
        cantidad: p.cantidad,
        total: p.total,
        costo: p.costo,
        margen: p.total - p.costo,
        margenPct: p.sinCosto > 0 ? undefined : p.total > 0 ? ((p.total - p.costo) / p.total) * 100 : undefined,
      })),
    rentabilidadPorRubro: Array.from(rubros.entries())
      .map(([rubro, r]) => ({
        rubro,
        total: r.total,
        costo: r.costo,
        margen: r.total - r.costo,
        margenPct: r.total > 0 ? ((r.total - r.costo) / r.total) * 100 : undefined,
      }))
      .sort((a, b) => b.total - a.total),
  };
}
