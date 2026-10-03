// lib/registro.ts — datos del alta self-service de un comercio (app/registro).
// Lo comparten el formulario y app/api/registro: mismas reglas en los dos lados.
import { z } from "zod";

export const RUBROS = [
  { id: "kiosco", nombre: "Kiosco" },
  { id: "almacen", nombre: "Almacén / despensa" },
  { id: "supermercado", nombre: "Supermercado / autoservicio" },
  { id: "panaderia", nombre: "Panadería" },
  { id: "verduleria", nombre: "Verdulería" },
  { id: "carniceria", nombre: "Carnicería" },
  { id: "dietetica", nombre: "Dietética" },
  { id: "ferreteria", nombre: "Ferretería" },
  { id: "libreria", nombre: "Librería" },
  { id: "otro", nombre: "Otro" },
] as const;

const IDS_RUBRO = RUBROS.map((r) => r.id) as [string, ...string[]];

const esquema = z.object({
  nombreComercio: z.string().trim().min(2, "Poné el nombre del comercio").max(80, "El nombre del comercio es muy largo"),
  nombre: z.string().trim().min(2, "Poné tu nombre").max(80, "Tu nombre es muy largo"),
  telefono: z
    .string()
    .transform((t) => t.replace(/[^\d+]/g, ""))
    .pipe(z.string().min(8, "Poné un WhatsApp válido, con característica").max(20, "Poné un WhatsApp válido")),
  rubro: z.enum(IDS_RUBRO, { errorMap: () => ({ message: "Elegí el rubro" }) }),
});

export type DatosRegistro = z.infer<typeof esquema>;

export function validarRegistro(entrada: unknown):
  | { ok: true; datos: DatosRegistro }
  | { ok: false; error: string } {
  const r = esquema.safeParse(entrada ?? {});
  if (r.success) return { ok: true, datos: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Datos inválidos" };
}
