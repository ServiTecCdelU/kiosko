// app/api/consultas/presupuestos/route.ts — lecturas de presupuestos.
// Conjunto cerrado de acciones (services/api-client.ts):
//   listar  -> los ultimos del comercio, con busqueda por cliente o numero
//   obtener -> uno, con sus items (para el PDF y para pasarlo a venta)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LISTA = 200;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const comercioId = comercioIdDeSesion(req);

  switch (body?.accion) {
    case "listar": {
      let q = supabaseAdmin
        .from("presupuestos")
        .select("id,numero,cliente_id,cliente_nombre,total,validez_dias,vence,estado,venta_id,notas,creado_por_nombre,created_at")
        .eq("comercio_id", comercioId)
        .order("created_at", { ascending: false })
        .limit(MAX_LISTA);
      const texto = String(body?.q ?? "").trim();
      if (texto) {
        // Numero exacto, o parte del nombre del cliente (sin comodines del usuario).
        const n = Number(texto.replace(/^#/, ""));
        q = Number.isInteger(n) && n > 0
          ? q.eq("numero", n)
          : q.ilike("cliente_nombre", `%${texto.replace(/[%_\\]/g, "")}%`);
      }
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ presupuestos: data ?? [] });
    }

    case "obtener": {
      const id = String(body?.id ?? "");
      const { data, error } = await supabaseAdmin
        .from("presupuestos").select("*").eq("comercio_id", comercioId).eq("id", id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ presupuesto: null, productos: [] });
      // Productos de hoy (stock, unidad, precio) para armar el carrito al pasarlo a venta.
      const ids = (Array.isArray(data.items) ? data.items : []).map((i: any) => String(i.productId));
      const { data: productos } = ids.length
        ? await supabaseAdmin.from("productos").select("*").eq("comercio_id", comercioId).in("id", ids)
        : { data: [] };
      return NextResponse.json({ presupuesto: data, productos: productos ?? [] });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
