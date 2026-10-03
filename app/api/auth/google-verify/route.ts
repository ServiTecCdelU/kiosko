// app/api/auth/google-verify/route.ts — segunda mitad del login con Google.
// El intercambio del codigo de OAuth por sesion (PKCE) lo hace el NAVEGADOR
// (app/auth/callback/page.tsx), porque ahi vive el code_verifier que Supabase
// Auth guarda en localStorage al iniciar el flujo — un server route nunca
// tiene acceso a eso, por eso el intercambio no puede hacerse en el servidor.
//
// Esta ruta recibe el access_token YA canjeado y lo vuelve a verificar
// server-side contra Supabase Auth (nunca confia en el email que mande el
// cliente): recien con ese email verificado busca superadmin/admin y emite
// la cookie firmada propia.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { patronCorreoExacto } from "@/lib/correo";
import { crearCookieRegistro, crearCookieSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const accessToken = String(body?.accessToken ?? "");
  if (!accessToken) return NextResponse.json({ error: "no_autorizado" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 500 });
  }

  // Cliente efimero solo para pedirle a Supabase Auth "a quien pertenece este
  // token" — lo verifica del lado de Supabase, no se confia en nada del body.
  const supabaseAuth = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabaseAuth.auth.getUser(accessToken);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) {
    return NextResponse.json(
      { error: "no_autorizado", detail: `getUser: ${error?.message ?? "sin email en el token"}` },
      { status: 401 },
    );
  }

  // Superadmin del SaaS (cruza todos los comercios): se chequea primero.
  const { data: superadmin, error: errorSuperadmin } = await supabaseAdmin
    .from("superadmins")
    .select("email, nombre")
    .ilike("email", patronCorreoExacto(email))
    .maybeSingle();

  if (superadmin) {
    const res = NextResponse.json({ redirectTo: "/superadmin/completando" });
    res.headers.append(
      "Set-Cookie",
      crearCookieSesion({
        usuarioId: superadmin.email, comercioId: "__superadmin__", rol: "superadmin",
        superadmin: true, nombre: superadmin.nombre ?? superadmin.email,
      }),
    );
    return res;
  }

  const { data: usuario, error: errorUsuario } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, rol, comercio_id, activo")
    .eq("rol", "admin")
    .eq("activo", true)
    .ilike("email", patronCorreoExacto(email))
    .maybeSingle();

  if (errorUsuario || errorSuperadmin) {
    return NextResponse.json(
      { error: "no_autorizado", detail: `superadminErr=${errorSuperadmin?.message ?? "-"} usuarioErr=${errorUsuario?.message ?? "-"}` },
      { status: 500 },
    );
  }

  // Correo verificado por Google pero sin comercio: onboarding self-service.
  // Se recuerda el correo en una cookie firmada corta y se manda a crear el
  // comercio (app/registro). El correo NUNCA sale del formulario.
  if (!usuario) {
    const meta = data.user?.user_metadata ?? {};
    const nombre = String(meta.full_name ?? meta.name ?? "").trim().slice(0, 80);
    const res = NextResponse.json({ redirectTo: "/registro" });
    res.headers.append("Set-Cookie", crearCookieRegistro({ email, nombre }));
    return res;
  }

  const res = NextResponse.json({ redirectTo: "/auth/completando" });
  res.headers.append(
    "Set-Cookie",
    crearCookieSesion({ usuarioId: usuario.id, comercioId: usuario.comercio_id, rol: usuario.rol }),
  );
  return res;
}
