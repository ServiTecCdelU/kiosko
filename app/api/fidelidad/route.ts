// app/api/fidelidad/route.ts — premio por cantidad de compras y sorteos (server-only).
// Conjunto cerrado de acciones. Las cuentas las hacen las funciones SQL de
// 37_sorteos_y_premios_por_compras.sql; aca solo se valida y se ata al comercio de la sesion.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_GESTION = ["admin", "encargado"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const fallo = (mensaje: string, status = 400) => NextResponse.json({ error: mensaje }, { status });

function texto(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

function entero(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fallo("JSON invalido");
  }

  const sesion = getSesion(req);
  if (!sesion) return fallo("Sesion vencida", 401);
  const comercioId = comercioIdDeSesion(req);
  const puedeGestionar = sesion.superadmin === true || ROLES_GESTION.includes(sesion.rol);
  const accion = texto(body?.accion, 40);

  const soloGestion = () => (puedeGestionar ? null : fallo("Solo un admin o encargado puede hacer esto", 403));

  switch (accion) {
    case "config": {
      const { data, error } = await supabaseAdmin
        .from("fidelidad_compras_config").select("*").eq("comercio_id", comercioId).maybeSingle();
      if (error) return fallo(error.message);
      return NextResponse.json({ config: data });
    }

    case "guardarConfig": {
      const denegado = soloGestion();
      if (denegado) return denegado;
      const meta = entero(body?.comprasMeta, 2, 100);
      const monto = Number(body?.montoMinimo ?? 0);
      const premio = texto(body?.premio);
      if (meta == null) return fallo("La cantidad de compras tiene que ser entre 2 y 100");
      if (!Number.isFinite(monto) || monto < 0) return fallo("El monto minimo no es valido");
      if (!premio) return fallo("Falta el premio");

      const { data: actual } = await supabaseAdmin
        .from("fidelidad_compras_config").select("activo, desde").eq("comercio_id", comercioId).maybeSingle();
      const activo = body?.activo === true;
      // Al activar (o reactivar) el programa las compras empiezan a contar desde hoy
      const reiniciar = activo && !actual?.activo;
      const fila: Record<string, unknown> = {
        comercio_id: comercioId, activo, compras_meta: meta, monto_minimo: monto, premio, updated_at: new Date().toISOString(),
      };
      if (reiniciar) fila.desde = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

      const { data, error } = await supabaseAdmin
        .from("fidelidad_compras_config").upsert(fila, { onConflict: "comercio_id" }).select("*").single();
      if (error) return fallo(error.message);
      return NextResponse.json({ config: data });
    }

    case "progreso": {
      const { data, error } = await supabaseAdmin.rpc("progreso_compras_kiosko", { p_comercio_id: comercioId });
      if (error) return fallo(error.message);
      return NextResponse.json({ clientes: data ?? [] });
    }

    case "canjearPremio": {
      const clienteId = texto(body?.clienteId, 80);
      if (!clienteId) return fallo("Falta el cliente");
      const { data, error } = await supabaseAdmin.rpc("canjear_premio_compras_kiosko", {
        p_cliente_id: clienteId, p_comercio_id: comercioId, p_usuario: sesion.nombre ?? null,
      });
      if (error) return fallo(error.message);
      return NextResponse.json(data);
    }

    case "sorteos": {
      const { data, error } = await supabaseAdmin
        .from("sorteos").select("*").eq("comercio_id", comercioId).neq("estado", "cancelado")
        .order("created_at", { ascending: false }).limit(20);
      if (error) return fallo(error.message);
      return NextResponse.json({ sorteos: data ?? [] });
    }

    case "crearSorteo": {
      const denegado = soloGestion();
      if (denegado) return denegado;
      const nombre = texto(body?.nombre);
      const premio = texto(body?.premio);
      const desde = texto(body?.desde, 10);
      const hasta = texto(body?.hasta, 10);
      const montoPorChance = Number(body?.montoPorChance ?? 0);
      if (!nombre || !premio) return fallo("Falta el nombre o el premio");
      if (!ISO.test(desde) || !ISO.test(hasta) || hasta < desde) return fallo("Las fechas no son validas");
      if (!Number.isFinite(montoPorChance) || montoPorChance < 0) return fallo("El monto por chance no es valido");

      const { data, error } = await supabaseAdmin.from("sorteos").insert({
        id: crypto.randomUUID(), comercio_id: comercioId, nombre, premio, desde, hasta, monto_por_chance: montoPorChance,
      }).select("*").single();
      if (error) return fallo(error.message);
      return NextResponse.json({ sorteo: data });
    }

    case "participantes": {
      const sorteoId = texto(body?.sorteoId, 80);
      if (!sorteoId) return fallo("Falta el sorteo");
      const { data, error } = await supabaseAdmin.rpc("sorteo_participantes_kiosko", {
        p_sorteo_id: sorteoId, p_comercio_id: comercioId,
      });
      if (error) return fallo(error.message);
      return NextResponse.json({ participantes: data ?? [] });
    }

    case "sortear": {
      const denegado = soloGestion();
      if (denegado) return denegado;
      const sorteoId = texto(body?.sorteoId, 80);
      if (!sorteoId) return fallo("Falta el sorteo");
      const { data, error } = await supabaseAdmin.rpc("sortear_kiosko", {
        p_sorteo_id: sorteoId, p_comercio_id: comercioId, p_usuario: sesion.nombre ?? null,
      });
      if (error) return fallo(error.message);
      return NextResponse.json(data);
    }

    case "cancelarSorteo": {
      const denegado = soloGestion();
      if (denegado) return denegado;
      const sorteoId = texto(body?.sorteoId, 80);
      if (!sorteoId) return fallo("Falta el sorteo");
      const { error } = await supabaseAdmin
        .from("sorteos").update({ estado: "cancelado" })
        .eq("id", sorteoId).eq("comercio_id", comercioId).eq("estado", "abierto");
      if (error) return fallo(error.message);
      return NextResponse.json({ ok: true });
    }

    default:
      return fallo("Accion desconocida");
  }
}
