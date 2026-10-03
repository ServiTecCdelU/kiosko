// lib/server/afip/config.ts — configuracion fiscal de cada comercio (server-only).
// La clave privada se guarda cifrada (AFIP_CERT_KEY) y nunca sale de aca: el
// navegador solo ve el estado (que pasos estan listos) y puede bajar el CSR.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cifrar, claveAfip, descifrar } from "@/lib/server/cifrado";
import { generarClaveYCsr, validarCertificado } from "@/lib/server/afip/cripto";
import type { Ambiente } from "@/lib/afip/constantes";
import type { DatosFiscales, Operacion } from "@/lib/afip/datos-fiscales";

export interface FilaConfigAfip {
  comercio_id: string;
  cuit: string;
  razon_social: string;
  domicilio: string;
  inicio_actividades: string;
  ingresos_brutos: string | null;
  punto_venta: number | null;
  ambiente: Ambiente;
  modo: "manual" | "automatico";
  clave_cifrada: string | null;
  csr_pem: string | null;
  cert_pem: string | null;
  cert_vence: string | null;
  activo: boolean;
}

/** Config lista para operar con AFIP (clave descifrada en memoria). */
export interface ConfigOperativa extends FilaConfigAfip {
  punto_venta: number;
  cert_pem: string;
  clavePem: string;
}

export async function leerConfigAfip(comercioId: string): Promise<FilaConfigAfip | null> {
  const { data, error } = await supabaseAdmin.from("afip_config").select("*").eq("comercio_id", comercioId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilaConfigAfip) ?? null;
}

/** Lo que ve la pantalla /facturacion: sin clave ni certificado. */
export function estadoPublico(fila: FilaConfigAfip | null) {
  if (!fila) return { configurado: false as const };
  return {
    configurado: true as const,
    cuit: fila.cuit,
    razonSocial: fila.razon_social,
    domicilio: fila.domicilio,
    inicioActividades: fila.inicio_actividades,
    ingresosBrutos: fila.ingresos_brutos,
    puntoVenta: fila.punto_venta,
    ambiente: fila.ambiente,
    modo: fila.modo,
    activo: fila.activo,
    tienePedido: !!fila.csr_pem,
    tieneCertificado: !!fila.cert_pem,
    certVence: fila.cert_vence,
  };
}

/** Config para emitir: exige pedido, certificado y punto de venta. */
export function configOperativa(fila: FilaConfigAfip | null): ConfigOperativa {
  if (!fila) throw new Error("La facturación electrónica no está configurada");
  if (!fila.clave_cifrada || !fila.cert_pem) throw new Error("Falta el certificado de AFIP. Completá la configuración en Facturación.");
  if (!fila.punto_venta) throw new Error("Falta el punto de venta. Completá la configuración en Facturación.");
  return { ...fila, punto_venta: fila.punto_venta, cert_pem: fila.cert_pem, clavePem: descifrar(fila.clave_cifrada, claveAfip()) };
}

async function actualizar(comercioId: string, cambios: Record<string, unknown>): Promise<FilaConfigAfip> {
  const { data, error } = await supabaseAdmin
    .from("afip_config")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("comercio_id", comercioId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FilaConfigAfip;
}

/**
 * Datos fiscales. Si cambia la CUIT, el pedido y el certificado (que son de la
 * CUIT anterior) dejan de servir: se descartan y se desactiva la facturacion.
 */
export async function guardarDatosFiscales(comercioId: string, d: DatosFiscales): Promise<FilaConfigAfip> {
  const previa = await leerConfigAfip(comercioId);
  const datos = {
    cuit: d.cuit,
    razon_social: d.razonSocial,
    domicilio: d.domicilio,
    inicio_actividades: d.inicioActividades,
    ingresos_brutos: d.ingresosBrutos,
  };
  if (!previa) {
    const { data, error } = await supabaseAdmin
      .from("afip_config")
      .insert({ comercio_id: comercioId, ...datos })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as FilaConfigAfip;
  }
  const cambioCuit = previa.cuit !== d.cuit;
  return actualizar(comercioId, cambioCuit
    ? { ...datos, clave_cifrada: null, csr_pem: null, cert_pem: null, cert_vence: null, activo: false }
    : datos);
}

/** Genera clave + CSR. Reemplaza el pedido anterior (y su certificado). */
export async function generarPedido(comercioId: string, slug: string): Promise<FilaConfigAfip> {
  const fila = await leerConfigAfip(comercioId);
  if (!fila) throw new Error("Primero guardá los datos fiscales");
  const { clavePem, csrPem } = generarClaveYCsr({ cuit: fila.cuit, razonSocial: fila.razon_social, alias: `comercio-${slug}` });
  return actualizar(comercioId, {
    clave_cifrada: cifrar(clavePem, claveAfip()),
    csr_pem: csrPem,
    cert_pem: null,
    cert_vence: null,
    activo: false,
  });
}

export async function subirCertificado(comercioId: string, certPem: string): Promise<FilaConfigAfip> {
  const fila = await leerConfigAfip(comercioId);
  if (!fila?.clave_cifrada) throw new Error("Primero generá el pedido de certificado");
  const r = validarCertificado(certPem, descifrar(fila.clave_cifrada, claveAfip()), fila.cuit);
  if (!r.ok) throw new Error(r.error);
  return actualizar(comercioId, { cert_pem: certPem.trim(), cert_vence: r.vence.toISOString(), activo: false });
}

/** Punto de venta, ambiente y modo. Cambiar punto de venta o ambiente pide volver a probar. */
export async function guardarOperacion(comercioId: string, o: Operacion): Promise<FilaConfigAfip> {
  const fila = await leerConfigAfip(comercioId);
  if (!fila) throw new Error("Primero guardá los datos fiscales");
  const cambiaConexion = fila.punto_venta !== o.puntoVenta || fila.ambiente !== o.ambiente;
  return actualizar(comercioId, {
    punto_venta: o.puntoVenta,
    ambiente: o.ambiente,
    modo: o.modo,
    ...(cambiaConexion ? { activo: false } : {}),
  });
}

export async function marcarActivo(comercioId: string, activo: boolean): Promise<FilaConfigAfip> {
  return actualizar(comercioId, { activo });
}
