// lib/afip/datos-fiscales.ts — validacion de la configuracion fiscal del comercio.
// La comparten la pantalla /facturacion y app/api/afip/config.
import { z } from "zod";
import { cuitValido } from "./comprobante.ts";

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const esquemaDatos = z.object({
  cuit: z
    .string()
    .transform((c) => c.replace(/\D/g, ""))
    .refine(cuitValido, "El CUIT no es válido (revisá los 11 números)"),
  razonSocial: z.string().trim().min(2, "Poné la razón social (como figura en AFIP)").max(120),
  domicilio: z.string().trim().min(5, "Poné el domicilio comercial").max(200),
  inicioActividades: fechaIso,
  ingresosBrutos: z.string().trim().max(40).optional().transform((v) => v || null),
  /** Monotributo emite Factura C; responsable inscripto, A y B (migracion 48). */
  condicionIva: z.enum(["monotributo", "responsable_inscripto"]).default("monotributo"),
});

export type DatosFiscales = z.infer<typeof esquemaDatos>;

const esquemaOperacion = z.object({
  puntoVenta: z.coerce.number().int("El punto de venta es un número entero").min(1, "Punto de venta inválido").max(99999),
  ambiente: z.enum(["homologacion", "produccion"]),
  modo: z.enum(["manual", "automatico"]),
});

export type Operacion = z.infer<typeof esquemaOperacion>;

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

function validar<T>(esquema: z.ZodType<T, z.ZodTypeDef, unknown>, entrada: unknown): Resultado<T> {
  const r = esquema.safeParse(entrada ?? {});
  return r.success ? { ok: true, datos: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Datos inválidos" };
}

export const validarDatosFiscales = (e: unknown) => validar(esquemaDatos, e);
export const validarOperacion = (e: unknown) => validar(esquemaOperacion, e);
