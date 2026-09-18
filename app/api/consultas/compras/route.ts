// app/api/consultas/compras/route.ts — lecturas de proveedores y compras.
// Conjunto cerrado de acciones: el cliente no elige tablas ni filtros.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_MAX = 200;

function acotar(valor: unknown, porDefecto: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.floor(n), LIMITE_MAX);
}

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
    case "proveedores": {
      // Incluye inactivos: el CRUD y el historial los necesitan; el selector
      // de recepcion filtra client-side por activo.
      const { data, error } = await supabaseAdmin
        .from("proveedores")
        .select("*")
        .eq("comercio_id", comercioId)
        .order("nombre", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ proveedores: data ?? [] });
    }

    case "compras": {
      let q = supabaseAdmin
        .from("compras")
        .select("*, proveedores(nombre)")
        .eq("comercio_id", comercioId);
      const proveedorId = String(body?.proveedorId ?? "");
      if (proveedorId) q = q.eq("proveedor_id", proveedorId);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(acotar(body?.limit, 50));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ compras: data ?? [] });
    }

    case "compraDetalle": {
      const compraId = String(body?.compraId ?? "");
      if (!compraId) return NextResponse.json({ error: "Falta la compra" }, { status: 400 });
      const [{ data: compra, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabaseAdmin
          .from("compras")
          .select("*, proveedores(nombre)")
          .eq("comercio_id", comercioId)
          .eq("id", compraId)
          .maybeSingle(),
        supabaseAdmin
          .from("compra_items")
          .select("*")
          .eq("comercio_id", comercioId)
          .eq("compra_id", compraId)
          .order("id", { ascending: true }),
      ]);
      if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      if (!compra) return NextResponse.json({ error: "Compra inexistente" }, { status: 404 });
      return NextResponse.json({ compra, items: items ?? [] });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
