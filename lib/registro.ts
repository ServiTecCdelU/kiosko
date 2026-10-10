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

/** Planes que se pueden elegir al registrarse (el precio sale de saas_planes). */
export const PLANES_REGISTRO = [
  { id: "basico", nombre: "Básico", detalle: "Punto de venta, stock, caja, clientes y reportes. 1 caja." },
  { id: "pro", nombre: "Pro", detalle: "Todo lo del Básico más facturación electrónica, cobros con Mercado Pago (QR y Point) y varias cajas." },
] as const;

export const MAX_CAJAS_REGISTRO = 10;

const esquema = z
  .object({
    nombreComercio: z.string().trim().min(2, "Poné el nombre del comercio").max(80, "El nombre del comercio es muy largo"),
    nombre: z.string().trim().min(2, "Poné tu nombre").max(80, "Tu nombre es muy largo"),
    telefono: z
      .string()
      .transform((t) => t.replace(/[^\d+]/g, ""))
      .pipe(z.string().min(8, "Poné un WhatsApp válido, con característica").max(20, "Poné un WhatsApp válido")),
    rubro: z.enum(IDS_RUBRO, { errorMap: () => ({ message: "Elegí el rubro" }) }),
    plan: z.enum(["basico", "pro"], { errorMap: () => ({ message: "Elegí un plan" }) }).default("basico"),
    cajas: z.coerce.number().int("Las cajas son un número entero").min(1, "Al menos 1 caja").max(MAX_CAJAS_REGISTRO, `Hasta ${MAX_CAJAS_REGISTRO} cajas; para más, escribinos`).default(1),
  })
  .refine((d) => d.plan === "pro" || d.cajas === 1, {
    message: "El plan Básico incluye 1 caja. Para más cajas elegí el plan Pro.",
    path: ["cajas"],
  });

export type DatosRegistro = z.infer<typeof esquema>;

export function validarRegistro(entrada: unknown):
  | { ok: true; datos: DatosRegistro }
  | { ok: false; error: string } {
  const r = esquema.safeParse(entrada ?? {});
  if (r.success) return { ok: true, datos: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Datos inválidos" };
}
