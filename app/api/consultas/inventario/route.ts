// app/api/consultas/inventario/route.ts — lecturas de recuentos (admin).
// Conjunto cerrado de acciones: abiertos, detalle, historial.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const comercioId = comercioIdDeSesion(req);
  const accion = String(body?.accion ?? "");

  switch (accion) {
    case "abiertos": {
      const { data, error } = await supabaseAdmin
        .from("inventarios")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("estado", "abierto")
        .order("created_at", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ inventarios: data ?? [] });
    }

    case "detalle": {
      const inventarioId = String(body?.inventarioId ?? "");
      if (!inventarioId) return NextResponse.json({ error: "Falta el recuento" }, { status: 400 });
      const [{ data: inv, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabaseAdmin.from("inventarios").select("*").eq("comercio_id", comercioId).eq("id", inventarioId).maybeSingle(),
        supabaseAdmin
          .from("inventario_items")
          .select("*")
          .eq("comercio_id", comercioId)
          .eq("inventario_id", inventarioId)
          .order("producto_nombre", { ascending: true })
          .limit(10000),
      ]);
      if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      if (!inv) return NextResponse.json({ error: "Recuento inexistente" }, { status: 404 });

      // Costo vigente para valorizar las diferencias en pantalla.
      const ids = (items ?? []).map((i: any) => i.producto_id);
      const costos: Record<string, number | null> = {};
      for (let i = 0; i < ids.length; i += 500) {
        const { data: prods } = await supabaseAdmin
          .from("productos")
          .select("id,precio_base")
          .eq("comercio_id", comercioId)
          .in("id", ids.slice(i, i + 500));
        for (const p of prods ?? []) costos[p.id] = p.precio_base != null ? Number(p.precio_base) : null;
      }
      return NextResponse.json({ inventario: inv, items: items ?? [], costos });
    }

    case "historial": {
      const { data, error } = await supabaseAdmin
        .from("inventarios")
        .select("*")
        .eq("comercio_id", comercioId)
        .neq("estado", "abierto")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ inventarios: data ?? [] });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
