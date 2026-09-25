// app/auth/callback/route.ts — vuelta del login con Google (Supabase Auth).
// Intercambia el codigo de OAuth por una sesion de Supabase Auth, toma el
// EMAIL VERIFICADO por Google desde ahi (nunca de algo que mande el cliente),
// y si coincide con un admin activo en `usuarios`, emite la cookie firmada
// propia (lib/server/sesion.ts) — la misma que usa el login por PIN.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { crearCookieSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_autorizado`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=no_autorizado`);
  }

  // Cliente efimero solo para canjear el codigo de OAuth por el usuario de
  // Google verificado por Supabase Auth. No persiste sesion de Supabase Auth
  // en ningun lado: la app sigue con su propia cookie.
  const supabaseAuth = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabaseAuth.auth.exchangeCodeForSession(code);

  const email = data?.user?.email?.toLowerCase();
  if (error || !email) {
    return NextResponse.redirect(`${origin}/login?error=no_autorizado`);
  }

  const { data: usuario, error: errorUsuario } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, rol, comercio_id, activo")
    .eq("rol", "admin")
    .eq("activo", true)
    .ilike("email", email)
    .maybeSingle();

  if (errorUsuario || !usuario) {
    return NextResponse.redirect(`${origin}/login?error=no_autorizado`);
  }

  const res = NextResponse.redirect(`${origin}/auth/completando`);
  res.headers.append(
    "Set-Cookie",
    crearCookieSesion({ usuarioId: usuario.id, comercioId: usuario.comercio_id, rol: usuario.rol }),
  );
  return res;
}
