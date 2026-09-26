// app/api/productos/route.ts — escrituras sobre productos (server-only, service role).
// PATCH -> editar un producto | PUT -> activar/desactivar una oferta
// Antes se escribia desde el navegador con el anon key: cualquiera con esa
// clave podia cambiar los precios de todo el catalogo.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deben coincidir con el CHECK de productos.oferta_tipo (08_ofertas.sql + 13_combos.sql)
// y con OfertaTipo en lib/types.ts.
const TIPOS_OFERTA = ["monto", "porcentaje", "combo"];

function errorOferta(oferta: any): string | null {
  if (!oferta.activa) return null;
  if (!TIPOS_OFERTA.includes(String(oferta.tipo))) return "Tipo de oferta invalido";
  const valor = Number(oferta.valor);
  if (!Number.isFinite(valor) || valor <= 0) return "El valor de la oferta debe ser mayor a 0";
  if (oferta.tipo === "porcentaje" && valor >= 100) return "El descuento debe ser menor al 100%";
  if (oferta.tipo === "combo") {
    const cantidad = Number(oferta.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 2) return "El combo necesita 2 o mas unidades";
  }
  return null;
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = comercioIdDeSesion(req);
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

  const comercioId = comercioIdDeSesion(req);
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
      id: crypto.randomUUID(),
      comercio_id: comercioId,
      codigo: input.codigo || null,
      codigo_barras: input.codigoBarras || null,
      name,
      category: input.category || "",
      price,
      precio_base: input.costo ?? null,
      stock,
      stock_minimo: Number(input.stockMinimo) || 0,
      lote: input.lote ?? null,
      unidad: input.unidad === "kg" ? "kg" : "un",
      stock_controlado: input.stockControlado ?? true,
      fecha_vencimiento: input.fechaVencimiento || null,
      favorito: !!input.favorito,
      revisar: input.revisar ?? true,
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

  const comercioId = comercioIdDeSesion(req);
  const productId = String(body?.productId ?? "");
  const oferta = body?.oferta;

  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  if (!oferta || typeof oferta !== "object") {
    return NextResponse.json({ error: "Faltan los datos de la oferta" }, { status: 400 });
  }
  const invalida = errorOferta(oferta);
  if (invalida) return NextResponse.json({ error: invalida }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("productos")
    .update({
      oferta_activa: !!oferta.activa,
      oferta_tipo: oferta.activa ? oferta.tipo ?? null : null,
      oferta_valor: oferta.activa ? Number(oferta.valor) || 0 : 0,
      oferta_cantidad: oferta.activa && oferta.tipo === "combo" ? Number(oferta.cantidad) : null,
    })
    .eq("comercio_id", comercioId)
    .eq("id", productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
