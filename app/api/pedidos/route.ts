// app/api/pedidos/route.ts — cambiar el estado de un pedido de la tienda online
// (nuevo -> preparando -> listo -> entregado, o cancelado). Lo hace quien atiende
// (cualquier rol con sesion). El paso a "entregado" con venta lo hace la venta
// (lib/server/procesar-venta.ts, pedidoId).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { ESTADO_PEDIDO_LABEL, esEstadoPedido, puedePasarA } from "@/lib/tienda";

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const comercioId = comercioIdDeSesion(req);
  const id = String(body?.id ?? "");
  const estado = body?.estado;
  if (!id || !esEstadoPedido(estado)) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });

  const { data: pedido, error: errorLeer } = await supabaseAdmin
    .from("pedidos").select("estado").eq("comercio_id", comercioId).eq("id", id).maybeSingle();
  if (errorLeer) return NextResponse.json({ error: errorLeer.message }, { status: 400 });
  if (!pedido) return NextResponse.json({ error: "El pedido no existe" }, { status: 404 });
  if (!esEstadoPedido(pedido.estado) || !puedePasarA(pedido.estado, estado)) {
    return NextResponse.json(
      { error: `El pedido está ${ESTADO_PEDIDO_LABEL[pedido.estado as keyof typeof ESTADO_PEDIDO_LABEL]?.toLowerCase() ?? pedido.estado}: no se puede pasar a ${ESTADO_PEDIDO_LABEL[estado].toLowerCase()}` },
      { status: 409 },
    );
  }

  // Solo si sigue en el estado que se leyo: dos personas atendiendo no se pisan.
  const { data, error } = await supabaseAdmin
    .from("pedidos")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("comercio_id", comercioId)
    .eq("id", id)
    .eq("estado", pedido.estado)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "El pedido cambió recién. Actualizá la lista." }, { status: 409 });
  return NextResponse.json({ ok: true, estado });
}
