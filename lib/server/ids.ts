// lib/server/ids.ts — ids "legibles" para filas nuevas (server-only).
//
// SaaS: los ids son unicos en TODA la base (todos los comercios comparten
// tablas). Antes eran <prefijo>_<nombre>_<n> con n = cuantos habia en la
// plataforma: dejaban ver datos de otros comercios ("cli_juanperez_2" = otro
// kiosko tiene un Juan Perez; "caja_<fecha>_5" = cajas abiertas hoy en toda la
// plataforma) y dos altas simultaneas chocaban. Ahora la parte final es
// aleatoria: se sigue leyendo de que se trata, sin filtrar nada de nadie.
import { randomBytes } from "node:crypto";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** "<prefijo>_<identificador>_<10 hex aleatorios>", ej: cli_juanperez_3f9a1c07be. */
export async function generarIdLegible(_tabla: string, prefijo: string, identificador: string): Promise<string> {
  const legible = slugify(identificador).slice(0, 24);
  return `${prefijo}_${legible ? `${legible}_` : ""}${randomBytes(5).toString("hex")}`;
}
