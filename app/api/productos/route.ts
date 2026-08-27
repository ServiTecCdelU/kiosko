// app/api/productos/route.ts — escrituras sobre productos (server-only, service role).
// PATCH -> editar un producto | PUT -> activar/desactivar una oferta
// Antes se escribia desde el navegador con el anon key: cualquiera con esa
// clave podia cambiar los precios de todo el catalogo.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS_OFERTA = ["descuento", "precio_fijo", "combo"];

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const productId = String(body?.productId ?? "");
  const input = body?.input;

  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del producto" }, { status: 400 });
  }

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Precio invalido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("productos")
    .update({
      codigo: input.codigo || null,
      codigo_barras: input.codigoBarras || null,
      name: input.name,
      category: input.category,
      price,
      precio_base: input.costo ?? null,
      stock_minimo: input.stockMinimo,
      lote: input.lote ?? null,
      disabled: input.disabled,
      revisar: input.revisar,
      favorito: input.favorito,
      fecha_vencimiento: input.fechaVencimiento || null,
      unidad: input.unidad,
      stock_controlado: input.stockControlado,
    })
    .eq("comercio_id", comercioId)
    .eq("id", productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const input = body?.input;
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del producto" }, { status: 400 });
  }

  const name = String(input.name ?? "").trim();
  const price = Number(input.price);
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Precio invalido" }, { status: 400 });
  }
  const stock = Number(input.stock) || 0;

  const { data, error } = await supabaseAdmin
    .from("productos")
    .insert({
      comercio_id: comercioId,
      codigo_barras: input.codigoBarras || null,
      name,
      category: input.category || "",
      price,
      stock,
      stock_minimo: 0,
      unidad: "un",
      stock_controlado: true,
      revisar: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PUT(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const productId = String(body?.productId ?? "");
  const oferta = body?.oferta;

  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  if (!oferta || typeof oferta !== "object") {
    return NextResponse.json({ error: "Faltan los datos de la oferta" }, { status: 400 });
  }
  if (oferta.activa && !TIPOS_OFERTA.includes(String(oferta.tipo))) {
    return NextResponse.json({ error: "Tipo de oferta invalido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("productos")
    .update({
      oferta_activa: !!oferta.activa,
      oferta_tipo: oferta.activa ? oferta.tipo ?? null : null,
      oferta_valor: oferta.activa ? Number(oferta.valor) || 0 : 0,
      oferta_cantidad: oferta.activa && oferta.tipo === "combo" ? oferta.cantidad ?? null : null,
    })
    .eq("comercio_id", comercioId)
    .eq("id", productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
