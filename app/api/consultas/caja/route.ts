// app/api/consultas/caja/route.ts — lecturas de caja y de clientes.
// Conjunto cerrado de acciones: el cliente no elige tablas ni filtros.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calcularResumenCaja } from "@/lib/server/caja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_MAX = 500;

function acotar(valor: unknown, porDefecto: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.floor(n), LIMITE_MAX);
}

/** Quita lo que rompe el filtro .or() de PostgREST. */
function sanitizar(q: string): string {
  return q.replace(/[,()%]/g, " ").trim();
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const accion = String(body?.accion ?? "");

  switch (accion) {
    case "cajaAbierta": {
      const { data, error } = await supabaseAdmin
        .from("caja")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("estado", "abierta")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ caja: data ?? null });
    }

    case "historialCajas": {
      const { data, error } = await supabaseAdmin
        .from("caja")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("estado", "cerrada")
        .order("closed_at", { ascending: false })
        .limit(acotar(body?.limit, 30));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ cajas: data ?? [] });
    }

    case "movimientosCaja": {
      const cajaId = String(body?.cajaId ?? "");
      if (!cajaId) return NextResponse.json({ error: "Falta la caja" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("caja_movimientos")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("caja_id", cajaId)
        .order("fecha", { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ movimientos: data ?? [] });
    }

    case "resumenCaja": {
      const cajaId = String(body?.cajaId ?? "");
      if (!cajaId) return NextResponse.json({ error: "Falta la caja" }, { status: 400 });
      return NextResponse.json(await calcularResumenCaja(cajaId, comercioId));
    }

    case "ventasPorCajero": {
      const cajaId = String(body?.cajaId ?? "");
      if (!cajaId) return NextResponse.json({ error: "Falta la caja" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("ventas")
        .select("total,user_name")
        .eq("comercio_id", comercioId)
        .eq("caja_id", cajaId)
        .eq("estado", "completada");
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ventas: data ?? [] });
    }

    // ── Clientes ──────────────────────────────────────────────
    case "listarClientes":
    case "buscarClientes": {
      const s = sanitizar(String(body?.search ?? ""));
      // El selector del POS no lista todo: sin texto no devuelve nada.
      if (accion === "buscarClientes" && !s) return NextResponse.json({ clientes: [] });

      let q = supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("activo", true);
      if (s) q = q.or(`nombre.ilike.%${s}%,telefono.ilike.%${s}%,documento.ilike.%${s}%`);

      const { data, error } = await q
        .order("nombre", { ascending: true })
        .limit(acotar(body?.limit, accion === "buscarClientes" ? 8 : 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ clientes: data ?? [] });
    }

    case "cliente": {
      const id = String(body?.id ?? "");
      if (!id) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("id", id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ cliente: data ?? null });
    }

    case "movimientosCliente": {
      const clienteId = String(body?.clienteId ?? "");
      if (!clienteId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("cuenta_corriente_mov")
        .select("*")
        .eq("comercio_id", comercioId)
        .eq("cliente_id", clienteId)
        .order("fecha", { ascending: false })
        .limit(acotar(body?.limit, 50));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ movimientos: data ?? [] });
    }

    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
