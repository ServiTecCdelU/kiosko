// lib/auth-correo.ts — entrar con un codigo que llega por correo (Supabase Auth),
// para quien no tiene o no quiere usar Google. Despues de verificar el codigo
// sigue igual que Google: app/api/auth/google-verify re-verifica el token y decide
// panel, superadmin o alta de un comercio nuevo.
// Spec: docs/superpowers/specs/2026-10-18-registro-con-correo-design.md
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiUrl } from "@/lib/utils/api-url";
import { explicarErrorCorreo, limpiarCodigo, normalizarCorreo } from "@/lib/correo";

/** Manda el codigo al correo. Si no tiene cuenta en Supabase Auth, se crea (asi se registra). */
export async function enviarCodigoPorCorreo(email: string): Promise<void> {
  const { error } = await getSupabaseBrowser().auth.signInWithOtp({
    email: normalizarCorreo(email),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(explicarErrorCorreo(error.message));
}

/** Canjea el codigo por una sesion y devuelve a donde ir (el mismo destino que con Google). */
export async function entrarConCodigo(email: string, codigo: string): Promise<string> {
  const { data, error } = await getSupabaseBrowser().auth.verifyOtp({
    email: normalizarCorreo(email),
    token: limpiarCodigo(codigo),
    type: "email",
  });
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new Error(explicarErrorCorreo(error?.message ?? "token"));

  const res = await fetch(apiUrl("/api/auth/google-verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.redirectTo) throw new Error("No se pudo entrar. Probá de nuevo en un momento.");
  return body.redirectTo as string;
}
