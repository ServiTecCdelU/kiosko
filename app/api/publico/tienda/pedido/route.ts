// app/api/publico/tienda/pedido/route.ts — el cliente de la tienda online manda su
// pedido (plan Tienda, etapa 2). Sin sesion.
//
// - La tienda tiene que estar abierta (misma regla que el catalogo, lib/server/tienda.ts).
// - Los precios los calcula el servidor (lib/tienda.ts + lib/pricing.ts), nunca el navegador.
// - Topes: 10 pedidos por hora por IP (en memoria) y 3 por telefono cada 15 minutos en
//   el mismo comercio (en la base, vale con varias instancias).
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { productosDeTienda, slugValido, tiendaDeSlug } from "@/lib/server/tienda";
import { crearLimitador, ipDe } from "@/lib/server/limite-intentos";
import { armarItemsPedido, datosClienteValidos, referenciaPagoPedido } from "@/lib/tienda";
import { crearPreferenciaMP, urlAbsolutaApp } from "@/lib/server/mercadopago";
import { tokenMPDeComercio } from "@/lib/server/mercadopago-credencial";
import { precioLinea } from "@/lib/pricing";

const porIp = crearLimitador(10, 60 * 60_000);
const MAX_POR_TELEFONO = 3;
const VENTANA_TELEFONO_MS = 15 * 60_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!slugValido(slug)) return NextResponse.json({ error: "Tienda inexistente" }, { status: 404 });

  const ip = ipDe(req);
  if (porIp.minutosBloqueado(ip) > 0) {
    return NextResponse.json({ error: "Mandaste muchos pedidos seguidos. Probá más tarde o escribile al comercio." }, { status: 429 });
  }

  try {
    const tienda = await tiendaDeSlug(slug);
    if (!tienda) return NextResponse.json({ error: "Tienda inexistente" }, { status: 404 });
    if (!tienda.abierta) return NextResponse.json({ error: "La tienda está cerrada por ahora" }, { status: 409 });

    const datos = datosClienteValidos(body?.datos, tienda.config);
    if ("error" in datos) return NextResponse.json({ error: datos.error }, { status: 400 });

    const lineas = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
    const ids = [...new Set(lineas.map((l: any) => String(l?.productId ?? "")))].filter(Boolean) as string[];
    const productos = ids.length ? await productosDeTienda(tienda.comercioId, ids) : [];
    const armado = armarItemsPedido(lineas, productos, precioLinea);
    if ("error" in armado) return NextResponse.json({ error: armado.error }, { status: 400 });

    const desde = new Date(Date.now() - VENTANA_TELEFONO_MS).toISOString();
    const { count } = await supabaseAdmin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("comercio_id", tienda.comercioId)
      .eq("cliente_telefono", datos.telefono)
      .gte("created_at", desde);
    if ((count ?? 0) >= MAX_POR_TELEFONO) {
      return NextResponse.json({ error: "Ya mandaste varios pedidos recién. Esperá unos minutos o escribile al comercio." }, { status: 429 });
    }

    const pedidoId = `ped_${randomUUID()}`;
    const { data, error } = await supabaseAdmin.rpc("crear_pedido_tienda", {
      p_comercio_id: tienda.comercioId,
      p_id: pedidoId,
      p_cliente_nombre: datos.nombre,
      p_cliente_telefono: datos.telefono,
      p_entrega: datos.entrega,
      p_direccion: datos.direccion,
      p_pago: datos.pago,
      p_nota: datos.nota,
      p_items: armado.items,
      p_total: armado.total,
    });
    if (error) return NextResponse.json({ error: "No se pudo guardar el pedido. Probá de nuevo." }, { status: 500 });
    porIp.registrar(ip);

    // Pago online (etapa 3): link de Mercado Pago por el total, a la cuenta del comercio.
    // Si MP falla el pedido ya quedo guardado: se paga al retirar o recibir.
    let pagoUrl: string | null = null;
    if (datos.pago === "mercadopago" && tienda.pagoOnline) {
      try {
        const ref = referenciaPagoPedido(pedidoId);
        const volver = (estado: string) => urlAbsolutaApp(`/tienda/${slug}?pedido=${data.numero}&pago=${estado}`);
        const preferencia = await crearPreferenciaMP(await tokenMPDeComercio(tienda.comercioId), {
          total: armado.total,
          externalReference: ref,
          descripcion: `Pedido N° ${data.numero} - ${tienda.nombre}`.slice(0, 120),
          comercioId: tienda.comercioId,
          volverA: { aprobado: volver("aprobado"), fallido: volver("fallido"), pendiente: volver("pendiente") },
        });
        await supabaseAdmin
          .from("pedidos")
          .update({ pago_estado: "pendiente", pago_ref: ref, updated_at: new Date().toISOString() })
          .eq("comercio_id", tienda.comercioId)
          .eq("id", pedidoId);
        pagoUrl = preferencia.initPoint;
      } catch (e) {
        console.error("[tienda] link de pago:", e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ ok: true, numero: data.numero, total: armado.total, items: armado.items, pagoUrl });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el pedido. Probá de nuevo." }, { status: 500 });
  }
}
