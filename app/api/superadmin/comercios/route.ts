// app/api/superadmin/comercios/route.ts — panel de superadmin: ver y
// administrar TODOS los comercios del SaaS. Cruza el aislamiento normal de
// comercio_id a proposito, por eso cada handler exige esSuperadmin(req)
// antes de tocar nada.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { patronCorreoExacto } from "@/lib/correo";
import { crearCookieSesion, esSuperadmin, getSesion } from "@/lib/server/sesion";
import { esSlugReservado } from "@/lib/panel";
import { olvidarAcceso } from "@/lib/server/acceso";
import { guardarPlan, listarPlanes, pagosDeComercio, registrarPagoManual } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESTADOS = ["activo", "prueba", "suspendido", "baja"];
const COLUMNAS_PANEL = "id, nombre, slug, estado, plan, trial_hasta, suscripcion_hasta, created_at, config";
const PLANES = ["free", "basico", "pro"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admins (acceso con Google) activos de un comercio. */
async function contarAccesos(comercioId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("comercio_id", comercioId)
    .eq("rol", "admin")
    .eq("activo", true)
    .not("email", "is", null);
  return count ?? 0;
}

async function contar(tabla: string, comercioId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from(tabla)
    .select("id", { count: "exact", head: true })
    .eq("comercio_id", comercioId);
  return count ?? 0;
}

export async function POST(req: Request) {
  if (!esSuperadmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const accion = String(body?.accion ?? "");

  if (accion === "listar") {
    // Columnas explicitas: el panel no necesita (ni debe recibir) el token
    // cifrado de Mercado Pago ni nada que se agregue a comercios despues.
    const { data: comercios, error } = await supabaseAdmin
      .from("comercios")
      .select(COLUMNAS_PANEL)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Pocos comercios en la practica (SaaS chico): una consulta de conteo por
    // tabla y por comercio es aceptable; no vale la pena una vista SQL todavia.
    const conUso = await Promise.all(
      (comercios ?? []).map(async (c: any) => ({
        ...c,
        uso: {
          productos: await contar("productos", c.id),
          ventas: await contar("ventas", c.id),
          usuarios: await contar("usuarios", c.id),
          accesos: await contarAccesos(c.id),
        },
      })),
    );

    return NextResponse.json({ comercios: conUso });
  }

  if (accion === "crear") {
    const nombre = String(body?.nombre ?? "").trim();
    const slugInput = String(body?.slug ?? "").trim().toLowerCase();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    const slug = slugInput || nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug) return NextResponse.json({ error: "No se pudo generar el slug" }, { status: 400 });
    if (esSlugReservado(slug)) {
      return NextResponse.json({ error: `"${slug}" es una ruta del sistema, elegí otro slug` }, { status: 400 });
    }

    const trialDias = Number(body?.trialDias) || 14;
    const { data, error } = await supabaseAdmin
      .from("comercios")
      .insert({
        id: `comercio_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        nombre,
        slug,
        estado: "prueba",
        plan: "free",
        trial_hasta: new Date(Date.now() + trialDias * 86400_000).toISOString(),
      })
      .select(COLUMNAS_PANEL)
      .single();

    if (error) {
      const msg = (error as any).code === "23505" ? "Ya existe un comercio con ese slug" : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Sin puesto no se puede abrir la caja (26_multi_caja.sql): nace con "Caja 1".
    const { error: errorPuesto } = await supabaseAdmin.from("puestos").insert({
      id: `puesto_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      comercio_id: data.id,
      nombre: "Caja 1",
    });
    if (errorPuesto) {
      return NextResponse.json({ error: `Comercio creado, pero falto la caja: ${errorPuesto.message}` }, { status: 400 });
    }
    return NextResponse.json({ comercio: data });
  }

  // Billing (49): pago manual (efectivo, transferencia) de un mes. Extiende
  // suscripcion_hasta hasta fin del mes que corresponda (RPC aplicar_pago_saas)
  // y queda en el mismo historial que los pagos de Mercado Pago.
  if (accion === "marcarPago") {
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
    try {
      const r = await registrarPagoManual(id, String(body?.nota ?? "").trim() || null, getSesion(req)?.nombre ?? "Superadmin");
      olvidarAcceso(id);
      const { data, error } = await supabaseAdmin.from("comercios").select(COLUMNAS_PANEL).eq("id", id).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ comercio: data, periodo: r.periodo });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo registrar el pago" }, { status: 400 });
    }
  }

  if (accion === "pagos") {
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
    try {
      return NextResponse.json({ pagos: await pagosDeComercio(id, 36) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron leer los pagos" }, { status: 400 });
    }
  }

  if (accion === "planes") {
    try {
      return NextResponse.json({ planes: await listarPlanes() });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron leer los planes" }, { status: 400 });
    }
  }

  if (accion === "guardarPlan") {
    try {
      await guardarPlan(String(body?.plan ?? ""), Number(body?.precioMensual), String(body?.descripcion ?? "").trim() || null);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el plan" }, { status: 400 });
    }
  }

  if (accion === "entrar") return entrarAComercio(req, String(body?.id ?? ""));
  if (accion === "salir") return volverAlPanel(req);
  if (accion === "accesos") return listarAccesos(String(body?.id ?? ""));
  if (accion === "agregarAcceso") {
    return agregarAcceso(String(body?.id ?? ""), String(body?.nombre ?? "").trim(), String(body?.email ?? "").trim().toLowerCase());
  }
  if (accion === "quitarAcceso") return quitarAcceso(String(body?.id ?? ""), String(body?.usuarioId ?? ""));

  return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
}

/**
 * Modo soporte: el superadmin entra al panel de un comercio como admin. La
 * cookie sigue marcada superadmin (puede volver al panel) y soporte=true
 * (app/api/auth/session la reconoce sin fila en `usuarios`).
 */
async function entrarAComercio(req: Request, id: string) {
  if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
  const { data: comercio, error } = await supabaseAdmin.from("comercios").select("id").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!comercio) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });

  const sesion = getSesion(req)!;
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", crearCookieSesion({
    usuarioId: sesion.usuarioId, comercioId: comercio.id, rol: "admin",
    superadmin: true, soporte: true, nombre: sesion.nombre,
  }));
  return res;
}

function volverAlPanel(req: Request) {
  const sesion = getSesion(req)!;
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", crearCookieSesion({
    usuarioId: sesion.usuarioId, comercioId: "__superadmin__", rol: "superadmin",
    superadmin: true, nombre: sesion.nombre,
  }));
  return res;
}

async function listarAccesos(id: string) {
  if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, email, activo")
    .eq("comercio_id", id)
    .eq("rol", "admin")
    .not("email", "is", null)
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ accesos: data ?? [] });
}

/** Da acceso con Google (usuario admin con ese correo) a un comercio. */
async function agregarAcceso(id: string, nombre: string, email: string) {
  if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
  if (!EMAIL_REGEX.test(email)) return NextResponse.json({ error: "Correo invalido" }, { status: 400 });

  // El login con Google busca UN admin activo por correo: el mismo correo en
  // dos comercios haria fallar el ingreso.
  const { data: existentes, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, comercio_id, activo")
    .eq("rol", "admin")
    .ilike("email", patronCorreoExacto(email));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const enOtro = (existentes ?? []).find((u) => u.comercio_id !== id && u.activo);
  if (enOtro) {
    const { data: otro } = await supabaseAdmin.from("comercios").select("nombre").eq("id", enOtro.comercio_id).maybeSingle();
    return NextResponse.json({ error: `Ese correo ya tiene acceso a "${otro?.nombre ?? enOtro.comercio_id}"` }, { status: 400 });
  }

  const propio = (existentes ?? []).find((u) => u.comercio_id === id);
  if (propio?.activo) return NextResponse.json({ error: "Ese correo ya tiene acceso a este comercio" }, { status: 400 });
  if (propio) {
    // Estaba dado de baja: se reactiva en vez de duplicarlo
    const { error: errAct } = await supabaseAdmin.rpc("actualizar_empleado_kiosko", {
      p_id: propio.id, p_nombre: nombre || propio.nombre, p_rol: "admin", p_activo: true,
    });
    if (errAct) return NextResponse.json({ error: errAct.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error: errCrear } = await supabaseAdmin.rpc("crear_empleado_kiosko", {
    p_comercio_id: id,
    p_nombre: nombre || email.split("@")[0],
    p_rol: "admin",
    p_email: email,
  });
  if (errCrear) return NextResponse.json({ error: errCrear.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

async function quitarAcceso(id: string, usuarioId: string) {
  if (!id || !usuarioId) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  const { data: u, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre")
    .eq("id", usuarioId)
    .eq("comercio_id", id)
    .eq("rol", "admin")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!u) return NextResponse.json({ error: "Acceso no encontrado" }, { status: 404 });

  // Se desactiva (no se borra): queda el historial de quien opero
  const { error: errAct } = await supabaseAdmin.rpc("actualizar_empleado_kiosko", {
    p_id: u.id, p_nombre: u.nombre, p_rol: "admin", p_activo: false,
  });
  if (errAct) return NextResponse.json({ error: errAct.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!esSuperadmin(req)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });

  const cambios: Record<string, any> = {};
  if (body?.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
    cambios.estado = body.estado;
  }
  if (body?.plan !== undefined) {
    if (!PLANES.includes(body.plan)) return NextResponse.json({ error: "Plan invalido" }, { status: 400 });
    cambios.plan = body.plan;
  }
  if (body?.trialHasta !== undefined) {
    if (body.trialHasta && Number.isNaN(new Date(body.trialHasta).getTime())) {
      return NextResponse.json({ error: "Fecha de fin de prueba invalida" }, { status: 400 });
    }
    cambios.trial_hasta = body.trialHasta || null;
  }
  if (body?.suscripcionHasta !== undefined) {
    cambios.suscripcion_hasta = body.suscripcionHasta || null;
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("comercios")
    .update(cambios)
    .eq("id", id)
    .select(COLUMNAS_PANEL)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Estado o prueba cambiaron: el bloqueo se recalcula ya (lib/server/acceso.ts).
  olvidarAcceso(id);
  return NextResponse.json({ comercio: data });
}
