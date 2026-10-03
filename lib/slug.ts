// lib/slug.ts — direccion del panel de un comercio (/<slug>) a partir de su nombre.
// El formato coincide con el que valida registrar_comercio_autoservicio
// (40_autoregistro.sql); si el slug ya existe, la base le agrega -2, -3...
import { esSlugReservado } from "./panel.ts";

export const SLUG_MAX = 40;
const SLUG_GENERICO = "mi-comercio";

export function slugDeNombre(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes y la virgulilla de la ñ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "");

  if (!base) return SLUG_GENERICO;
  // Las rutas fijas de la app ganan sobre /[comercio]: el panel no se veria.
  return esSlugReservado(base) ? `${base}-comercio` : base;
}
