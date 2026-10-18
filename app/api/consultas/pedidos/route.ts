// app/api/consultas/pedidos/route.ts — lecturas de los pedidos de la tienda online.
// Conjunto cerrado de acciones (services/api-client.ts):
//   listar  -> los del comercio: "activos" (nuevo, preparando, listo) o un estado
//   obtener -> uno, con los productos de hoy (para pasarlo a venta en la caja)
//   nuevos  -> cuantos hay sin atender (aviso en el menu)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esEstadoPedido } from "@/lib/tienda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LISTA = 200;
const ACTIVOS = ["nuevo", "preparando", "listo"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const comercioId = comercioIdDeSesion(req);

  switch (body?.accion) {
    case "listar": {
      const estado = body?.estado;
      let q = supabaseAdmin
        .from("pedidos")
        .select("*")
        .eq("comercio_id", comercioId)
        .order("created_at", { ascending: false })
        .limit(MAX_LISTA);
      q = esEstadoPedido(estado) ? q.eq("estado", estado) : q.in("estado", ACTIVOS);
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ pedidos: data ?? [] });
    }

    case "obtener": {
      const id = String(body?.id ?? "");
      const { data, error } = await supabaseAdmin
        .from("pedidos").select("*").eq("comercio_id", comercioId).eq("id", id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ pedido: null, productos: [] });
      const ids = (Array.isArray(data.items) ? data.items : []).map((i: any) => String(i.productId));
      const { data: productos } = ids.length
        ? await supabaseAdmin.from("productos").select("*").eq("comercio_id", comercioId).in("id", ids)
        : { data: [] };
      return NextResponse.json({ pedido: data, productos: productos ?? [] });
    }

    case "nuevos": {
      const { count, error } = await supabaseAdmin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("comercio_id", comercioId)
        .eq("estado", "nuevo");
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ nuevos: count ?? 0 });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
