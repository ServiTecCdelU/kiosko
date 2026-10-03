// app/api/registro/route.ts — alta self-service de un comercio.
// Spec: docs/superpowers/specs/2026-10-03-autoregistro-design.md
//
// Publica en proxy.ts (todavia no hay sesion), pero solo sirve con la cookie
// firmada de registro que emite el login con Google: el correo del dueño sale
// de ahi, verificado por Google, nunca del formulario.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  borrarCookieRegistro, crearCookieSesion, getRegistro,
} from "@/lib/server/sesion";
import { crearLimitador, ipDe } from "@/lib/server/limite-intentos";
import { validarRegistro } from "@/lib/registro";
import { slugDeNombre } from "@/lib/slug";
import { TRIAL_DAYS } from "@/lib/marketing/contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Como mucho 3 comercios nuevos por IP por hora: frena altas en masa sin
// molestar a nadie real.
const altasPorIp = crearLimitador(3, 60 * 60 * 1000);

/** Datos de Google para precargar el formulario. */
export async function GET(req: Request) {
  const registro = getRegistro(req);
  if (!registro) return NextResponse.json({ error: "Sin registro" }, { status: 401 });
  return NextResponse.json({ email: registro.email, nombre: registro.nombre });
}

export async function POST(req: Request) {
  const registro = getRegistro(req);
  if (!registro) {
    return NextResponse.json(
      { error: "Pasaron más de 30 minutos. Volvé a continuar con Google." },
      { status: 401 },
    );
  }

  const ip = ipDe(req);
  const espera = altasPorIp.minutosBloqueado(ip);
  if (espera > 0) {
    return NextResponse.json(
      { error: `Se crearon varios comercios desde esta conexión. Probá de nuevo en ${espera} minutos.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const validado = validarRegistro(body);
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });
  const datos = validado.datos;

  const { data, error } = await supabaseAdmin.rpc("registrar_comercio_autoservicio", {
    p_email: registro.email,
    p_nombre_comercio: datos.nombreComercio,
    p_slug_base: slugDeNombre(datos.nombreComercio),
    p_nombre_admin: datos.nombre,
    p_telefono: datos.telefono,
    p_rubro: datos.rubro,
    p_trial_dias: TRIAL_DAYS,
  });

  if (error) {
    if (error.message.includes("YA_REGISTRADO")) {
      return NextResponse.json(
        { error: "Esa cuenta de Google ya tiene un comercio. Entrá desde Ingresar.", yaRegistrado: true },
        { status: 409 },
      );
    }
    // Dos altas simultaneas con el mismo nombre pueden chocar en el slug.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "No se pudo crear el comercio. Probá de nuevo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el comercio" }, { status: 500 });
  }

  const creado = (Array.isArray(data) ? data[0] : data) as { nuevo_id: string; nuevo_slug: string } | undefined;
  if (!creado?.nuevo_id) return NextResponse.json({ error: "No se pudo crear el comercio" }, { status: 500 });

  const { data: admin } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("comercio_id", creado.nuevo_id)
    .eq("rol", "admin")
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "El comercio se creó pero no se pudo iniciar sesión. Entrá desde Ingresar." }, { status: 500 });

  altasPorIp.registrar(ip);

  // Queda logueado como admin de su comercio nuevo: /auth/completando carga la
  // sesion en el navegador y lo lleva al panel /<slug>.
  const res = NextResponse.json({ redirectTo: "/auth/completando", slug: creado.nuevo_slug });
  res.headers.append("Set-Cookie", crearCookieSesion({ usuarioId: admin.id, comercioId: creado.nuevo_id, rol: "admin" }));
  res.headers.append("Set-Cookie", borrarCookieRegistro());
  return res;
}
