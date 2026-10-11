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
import { DEMO_SLUG } from "@/lib/demo";
import { olvidarAcceso } from "@/lib/server/acceso";
import {
  estadoSuscripcion, guardarGrupo, guardarPlan, listarGrupos, listarPlanes, pagosDeComercio, registrarPagoManual,
} from "@/lib/server/billing";
import { debitoDeComercio } from "@/lib/server/billing-debito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESTADOS = ["activo", "prueba", "suspendido", "baja"];
const COLUMNAS_PANEL = "id, nombre, slug, estado, plan, trial_hasta, suscripcion_hasta, created_at, config, grupo_id";
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

    // Debito automatico de Mercado Pago (saas_debitos): una consulta para todos.
    const { data: debitos } = await supabaseAdmin.from("saas_debitos").select("comercio_id, estado");
    const debitoDe = new Map((debitos ?? []).map((d: any) => [d.comercio_id, d.estado]));

    // Pocos comercios en la practica (SaaS chico): una consulta de conteo por
    // tabla y por comercio es aceptable; no vale la pena una vista SQL todavia.
    const conUso = await Promise.all(
      (comercios ?? []).map(async (c: any) => ({
        ...c,
        debito: debitoDe.get(c.id) ?? null,
        uso: {
          productos: await contar("productos", c.id),
          ventas: await contar("ventas", c.id),
          usuarios: await contar("usuarios", c.id),
          accesos: await contarAccesos(c.id),
        },
      })),
    );

    // Los planes van para que el panel calcule el aviso de pago (precio > 0)
    // con la misma regla que proxy.ts (lib/acceso-comercio.ts).
    const [grupos, planes] = await Promise.all([listarGrupos().catch(() => []), listarPlanes().catch(() => [])]);
    return NextResponse.json({ comercios: conUso, grupos, planes });
  }

  // Grupos de sucursales (53): mismo dueño, descuento para las sucursales que no son la principal.
  if (accion === "grupos") {
    try {
      return NextResponse.json({ grupos: await listarGrupos() });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron leer los grupos" }, { status: 400 });
    }
  }
  if (accion === "guardarGrupo") {
    try {
      const grupo = await guardarGrupo(body?.id ? String(body.id) : null, String(body?.nombre ?? ""), Number(body?.descuentoPct));
      return NextResponse.json({ grupo });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el grupo" }, { status: 400 });
    }
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

  // Dashboard de metricas (lib/superadmin-metricas.ts calcula en el navegador):
  // todos los comercios, los pagos aprobados, los debitos y el historial de
  // eventos (56). Si la migracion 56 no corrio, eventos va null y el panel avisa.
  if (accion === "metricas") {
    const [comercios, pagos, debitos, eventos, planes] = await Promise.all([
      supabaseAdmin.from("comercios").select("id, created_at, estado, plan, trial_hasta, config"),
      supabaseAdmin.from("saas_pagos").select("comercio_id, plan, monto, metodo, aprobado_at, created_at").eq("estado", "aprobado"),
      supabaseAdmin.from("saas_debitos").select("comercio_id, estado, created_at, cancelado_at"),
      supabaseAdmin.from("saas_eventos").select("comercio_id, tipo, de, a, created_at"),
      listarPlanes().catch(() => []),
    ]);
    const error = comercios.error ?? pagos.error ?? debitos.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({
      comercios: (comercios.data ?? []).map((c: any) => ({
        id: c.id, created_at: c.created_at, estado: c.estado, plan: c.plan, trial_hasta: c.trial_hasta,
        origen: c.config?.origen ?? null, rubro: c.config?.rubro ?? null,
      })),
      pagos: (pagos.data ?? []).map((p: any) => ({
        comercio_id: p.comercio_id, plan: p.plan, monto: Number(p.monto) || 0, metodo: p.metodo, fecha: p.aprobado_at ?? p.created_at,
      })),
      debitos: debitos.data ?? [],
      eventos: eventos.error ? null : (eventos.data ?? []),
      // Para diagnosticar desde el panel por que no se leyo saas_eventos.
      eventosError: eventos.error?.message ?? null,
      planes,
    });
  }

  // Ficha completa para "Administrar": correos del dueño, cuanto paga por mes
  // (plan + cajas extra - descuento de grupo), debito automatico de Mercado
  // Pago y el historial de pagos.
  if (accion === "ficha") {
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
    try {
      const [s, debito, { data: admins }] = await Promise.all([
        estadoSuscripcion(id),
        debitoDeComercio(id).catch(() => null),
        supabaseAdmin.from("usuarios").select("nombre, email").eq("comercio_id", id).eq("rol", "admin").eq("activo", true)
          .not("email", "is", null).order("created_at", { ascending: true }),
      ]);
      return NextResponse.json({
        ficha: {
          correos: (admins ?? []).map((a: any) => ({ nombre: a.nombre ?? "", email: a.email })),
          nombrePlan: s.nombrePlan,
          monto: s.monto,
          cajasActivas: s.monto.cajas,
          suscripcionHasta: s.suscripcionHasta,
          proximo: s.proximo,
          grupo: s.grupo ? { nombre: s.grupo.nombre, descuentoPct: s.grupo.descuentoAplicado } : null,
          debito,
          pagos: s.pagos,
        },
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer la ficha" }, { status: 400 });
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
      await guardarPlan(
        String(body?.plan ?? ""), Number(body?.precioMensual), String(body?.descripcion ?? "").trim() || null,
        Number(body?.cajasIncluidas) || 1, Number(body?.precioCajaExtra) || 0,
        body?.maxCajas === null || body?.maxCajas === "" || body?.maxCajas === undefined ? null : Number(body.maxCajas),
      );
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el plan" }, { status: 400 });
    }
  }

  // Borra el comercio con todos sus datos (RPC eliminar_comercio, 57). Pide el
  // slug exacto como confirmacion; la demo nunca se borra.
  if (accion === "eliminar") {
    const id = String(body?.id ?? "");
    const confirmacion = String(body?.slug ?? "").trim().toLowerCase();
    if (!id) return NextResponse.json({ error: "Falta el comercio" }, { status: 400 });
    const { data: c, error } = await supabaseAdmin.from("comercios").select("id, slug, nombre").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!c) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    if (c.slug === DEMO_SLUG) return NextResponse.json({ error: "La demo no se puede eliminar" }, { status: 400 });
    if (confirmacion !== c.slug) return NextResponse.json({ error: `Para confirmar escribí exactamente "${c.slug}"` }, { status: 400 });
    const { data: borrado, error: errorRpc } = await supabaseAdmin.rpc("eliminar_comercio", { p_comercio_id: id });
    if (errorRpc) return NextResponse.json({ error: errorRpc.message }, { status: 400 });
    olvidarAcceso(id);
    return NextResponse.json({ ok: true, nombre: c.nombre, borrado });
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
  if (body?.grupoId !== undefined) {
    const grupoId = body.grupoId ? String(body.grupoId) : null;
    if (grupoId) {
      const { data: g } = await supabaseAdmin.from("saas_grupos").select("id").eq("id", grupoId).maybeSingle();
      if (!g) return NextResponse.json({ error: "Grupo inexistente" }, { status: 400 });
    }
    cambios.grupo_id = grupoId;
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
