// lib/server/ids.ts — generacion de ids legibles (server-only, service role).
// Espejo de generateReadableId de services/supabase-helpers.ts, pero con el
// cliente admin: los ids se generan del lado del servidor junto con el insert.
import { supabaseAdmin } from "@/lib/supabase-admin";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function generarIdLegible(
  tabla: string,
  prefijo: string,
  identificador: string,
): Promise<string> {
  const base = `${prefijo}_${slugify(identificador)}`;
  for (let num = 1; num < 1000; num++) {
    const candidato = `${base}_${num}`;
    const { data } = await supabaseAdmin.from(tabla).select("id").eq("id", candidato).maybeSingle();
    if (!data) return candidato;
  }
  return `${base}_${Date.now()}`;
}
