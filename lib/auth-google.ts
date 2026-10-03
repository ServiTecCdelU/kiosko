// lib/auth-google.ts — arranca el login con Google (Supabase Auth). Vuelve a
// /auth/callback, que verifica el token server-side (app/api/auth/google-verify)
// y decide: panel del comercio, superadmin o alta de un comercio nuevo.
// Lo usan el login y el registro.
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiUrl } from "@/lib/utils/api-url";

/** Redirige el navegador entero a Google. Si vuelve, es porque fallo antes. */
export async function iniciarLoginGoogle(): Promise<void> {
  const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${apiUrl("/auth/callback")}` },
  });
  if (error) throw error;
}
