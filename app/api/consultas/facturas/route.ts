// app/api/consultas/facturas/route.ts — lecturas de facturacion electronica.
// Conjunto cerrado de acciones (services/api-client.ts):
//   modo       -> si el comercio factura y como (para mostrar "Facturar" en el POS)
//   deVentas   -> facturas y notas de credito de un listado de ventas
//   comprobante-> todo lo necesario para imprimir un comprobante autorizado
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { leerConfigAfip } from "@/lib/server/afip/config";
import { urlQrAfip } from "@/lib/afip/comprobante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VENTAS = 500;
const COLUMNAS_RESUMEN = "id, venta_id, devolucion_id, cbte_tipo, punto_venta, numero, fecha, total, estado, error, cae, ambiente, created_at";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const comercioId = comercioIdDeSesion(req);

  try {
    switch (body?.accion) {
      case "modo": {
        if (await esComercioDemo(comercioId)) return NextResponse.json({ activo: false, modo: "manual", demo: true });
        const cfg = await leerConfigAfip(comercioId);
        return NextResponse.json({
          activo: !!cfg?.activo, modo: cfg?.modo ?? "manual", ambiente: cfg?.ambiente ?? null,
          condicionIva: cfg?.condicion_iva ?? "monotributo",
        });
      }

      case "deVentas": {
        const ids = Array.isArray(body?.ventaIds) ? body.ventaIds.filter((x: unknown) => typeof x === "string").slice(0, MAX_VENTAS) : [];
        if (ids.length === 0) return NextResponse.json({ facturas: [] });
        const { data, error } = await supabaseAdmin
          .from("facturas").select(COLUMNAS_RESUMEN)
          .eq("comercio_id", comercioId).in("venta_id", ids)
          .order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        return NextResponse.json({ facturas: data ?? [] });
      }

      case "comprobante": {
        const { data: f, error } = await supabaseAdmin
          .from("facturas").select("*")
          .eq("comercio_id", comercioId).eq("id", String(body?.facturaId ?? "")).maybeSingle();
        if (error) throw new Error(error.message);
        if (!f) return NextResponse.json({ error: "No se encontró el comprobante" }, { status: 404 });
        if (f.estado !== "autorizada") return NextResponse.json({ error: "El comprobante todavía no está autorizado por AFIP" }, { status: 409 });

        const cfg = await leerConfigAfip(comercioId);
        if (!cfg) throw new Error("Falta la configuración fiscal");

        // Detalle: la devolucion (nota de credito parcial) o la venta.
        let items: { nombre: string; cantidad: number; precio: number; subtotal: number }[] = [];
        if (f.devolucion_id) {
          const { data } = await supabaseAdmin.from("devolucion_items")
            .select("producto_nombre, cantidad, precio_unitario, subtotal").eq("devolucion_id", f.devolucion_id);
          items = (data ?? []).map((i) => ({ nombre: i.producto_nombre, cantidad: Number(i.cantidad), precio: Number(i.precio_unitario), subtotal: Number(i.subtotal) }));
        } else if (f.venta_id) {
          const { data } = await supabaseAdmin.from("ventas").select("items, discount").eq("id", f.venta_id).maybeSingle();
          items = (Array.isArray(data?.items) ? data.items : []).map((i: any) => ({
            nombre: String(i.name ?? ""), cantidad: Number(i.quantity) || 0, precio: Number(i.price) || 0, subtotal: Number(i.subtotal) || 0,
          }));
        }

        let asociado: { cbteTipo: number; puntoVenta: number; numero: number } | null = null;
        if (f.factura_asociada_id) {
          const { data } = await supabaseAdmin.from("facturas").select("cbte_tipo, punto_venta, numero").eq("id", f.factura_asociada_id).maybeSingle();
          if (data) asociado = { cbteTipo: data.cbte_tipo, puntoVenta: data.punto_venta, numero: Number(data.numero) };
        }

        return NextResponse.json({
          comprobante: {
            id: f.id, cbteTipo: f.cbte_tipo, puntoVenta: f.punto_venta, numero: Number(f.numero), fecha: f.fecha,
            total: Number(f.total), docTipo: f.doc_tipo, docNro: f.doc_nro, receptorNombre: f.receptor_nombre,
            receptorCondicion: Number(f.receptor_condicion) || 5,
            neto: f.neto != null ? Number(f.neto) : null, iva: f.iva != null ? Number(f.iva) : null,
            exento: f.exento != null ? Number(f.exento) : null, alicuotas: Array.isArray(f.alicuotas) ? f.alicuotas : [],
            cae: f.cae, caeVto: f.cae_vto, ambiente: f.ambiente, asociado, items,
            qr: urlQrAfip({
              fecha: f.fecha, cuit: cfg.cuit, puntoVenta: f.punto_venta, cbteTipo: f.cbte_tipo, numero: Number(f.numero),
              total: Number(f.total), docTipo: f.doc_tipo, docNro: f.doc_nro, cae: f.cae,
            }),
          },
          emisor: {
            razonSocial: cfg.razon_social, cuit: cfg.cuit, domicilio: cfg.domicilio,
            ingresosBrutos: cfg.ingresos_brutos, inicioActividades: cfg.inicio_actividades,
            condicionIva: cfg.condicion_iva ?? "monotributo",
          },
        });
      }

      default:
        return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
