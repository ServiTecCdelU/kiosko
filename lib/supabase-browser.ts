// lib/supabase-browser.ts — cliente de Supabase para el navegador.
// Unico uso: iniciar el login con Google (Supabase Auth). Las lecturas y
// escrituras de datos siguen yendo por las rutas /api/* con service role,
// esto NO reemplaza a lib/supabase-admin.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _browser: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase no configurado: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  _browser = createClient(url, key);
  return _browser;
}
