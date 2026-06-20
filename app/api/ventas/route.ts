// app/api/ventas/route.ts — alta de venta atomica via RPC process_sale_kiosko
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

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "El carrito esta vacio" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");

  // Precio y nombre autoritativos desde la BD (no confiar en el cliente),
  // acotados al comercio para no cruzar catalogos entre tenants.
  const ids: string[] = rawItems.map((i: any) => String(i.productId)).filter(Boolean);
  const { data: prods, error: prodErr } = await supabaseAdmin
    .from("productos")
    .select("id,name,price")
    .eq("comercio_id", comercioId)
    .in("id", ids);
  if (prodErr) {
    return NextResponse.json({ error: prodErr.message }, { status: 500 });
  }
  const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));

  const items = rawItems.map((i: any) => {
    const id = String(i.productId);
    const db = byId.get(id);
    const price = db ? Number(db.price) : Number(i.price) || 0;
    const name = db ? db.name : String(i.name ?? "");
    const quantity = Number(i.quantity) || 0;
    return { productId: id, name, quantity, price, subtotal: price * quantity };
  });

  const discount = Number(body?.discount) || 0;
  const total = Math.max(0, items.reduce((s, i) => s + i.subtotal, 0) - discount);

  const { data, error } = await supabaseAdmin.rpc("process_sale_kiosko", {
    p_items: items,
    p_total: total,
    p_payment_method: body?.paymentMethod ?? "efectivo",
    p_cash_amount: Number(body?.cashAmount) || 0,
    p_change_amount: Number(body?.changeAmount) || 0,
    p_transfer_amount: Number(body?.transferAmount) || 0,
    p_discount: discount,
    p_caja_id: body?.cajaId ?? null,
    p_user_id: body?.userId ?? null,
    p_user_name: body?.userName ?? null,
    p_cliente_id: body?.clienteId ?? null,
    p_comercio_id: comercioId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    id: data.id,
    saleNumber: data.sale_number,
    total: data.total,
  });
}
