// services/facturacion-service.ts — facturacion electronica AFIP/ARCA (client helper).
import { consultar } from "@/services/api-client";
import { apiUrl } from "@/lib/utils/api-url";
import { descargarBlob } from "@/lib/utils/descargar";
import type { CondicionEmisor, CondicionReceptor } from "@/lib/afip/iva";

export type EstadoFactura = "pendiente" | "autorizada" | "rechazada" | "error";

export interface FacturaResumen {
  id: string;
  venta_id: string | null;
  devolucion_id: string | null;
  cbte_tipo: number;
  punto_venta: number;
  numero: number | null;
  fecha: string;
  total: number;
  estado: EstadoFactura;
  error: string | null;
  cae: string | null;
  ambiente: "homologacion" | "produccion";
  /** Contingencia (51): salio con CAEA y, si ya se informo a AFIP. */
  tipo_autorizacion?: "CAE" | "CAEA";
  caea?: string | null;
  caea_informada?: boolean;
}

export interface EstadoConfigAfip {
  configurado: boolean;
  demo?: boolean;
  cuit?: string;
  razonSocial?: string;
  domicilio?: string;
  inicioActividades?: string;
  ingresosBrutos?: string | null;
  condicionIva?: CondicionEmisor;
  puntoVenta?: number | null;
  ambiente?: "homologacion" | "produccion";
  modo?: "manual" | "automatico";
  activo?: boolean;
  caeaActivo?: boolean;
  tienePedido?: boolean;
  tieneCertificado?: boolean;
  certVence?: string | null;
}

export interface PasoPrueba {
  paso: string;
  ok: boolean;
  detalle: string;
}

export interface Comprobante {
  comprobante: {
    id: string; cbteTipo: number; puntoVenta: number; numero: number; fecha: string; total: number;
    docTipo: number; docNro: string; receptorNombre: string | null; receptorCondicion: number;
    /** "CAE" o "CAEA" (contingencia). `cae` trae el codigo que corresponda. */
    tipoAutorizacion: "CAE" | "CAEA"; cae: string; caeVto: string;
    ambiente: "homologacion" | "produccion";
    asociado: { cbteTipo: number; puntoVenta: number; numero: number } | null;
    items: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
    /** Factura A/B: desglose declarado a AFIP. Null en Factura C. */
    neto: number | null; iva: number | null; exento: number | null;
    alicuotas: { id: number; alicuota: number; base: number; importe: number }[];
    qr: string;
  };
  emisor: {
    razonSocial: string; cuit: string; domicilio: string; ingresosBrutos: string | null; inicioActividades: string;
    condicionIva: CondicionEmisor;
  };
}

async function pedir<T>(ruta: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(ruta), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo completar la operación");
  return data as T;
}

// ── Configuracion (solo admin) ──
export const getConfigAfip = () => pedir<EstadoConfigAfip>("/api/afip/config", "GET");
export const guardarDatosFiscales = (datos: Record<string, unknown>) => pedir<EstadoConfigAfip>("/api/afip/config", "PUT", datos);
export const guardarOperacionAfip = (datos: Record<string, unknown>) => pedir<EstadoConfigAfip>("/api/afip/config", "PATCH", datos);
export const desactivarAfip = () => pedir<EstadoConfigAfip>("/api/afip/config", "PATCH", { activo: false });
export const generarPedidoCertificado = () => pedir<EstadoConfigAfip>("/api/afip/pedido", "POST", {});
export const subirCertificadoAfip = (certificado: string) => pedir<EstadoConfigAfip>("/api/afip/certificado", "POST", { certificado });
export const probarAfip = (activar: boolean) =>
  pedir<{ ok: boolean; pasos: PasoPrueba[]; estado: EstadoConfigAfip }>("/api/afip/probar", "POST", { activar });

export async function descargarPedidoCertificado(): Promise<void> {
  const res = await fetch(apiUrl("/api/afip/pedido"));
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudo descargar el pedido");
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "pedido.csr";
  descargarBlob(await res.blob(), nombre);
}

/** Texto del pedido (.csr): en WSASS (pruebas) ARCA pide pegarlo, no subirlo. */
export async function textoPedidoCertificado(): Promise<string> {
  const res = await fetch(apiUrl("/api/afip/pedido"));
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudo leer el pedido");
  return res.text();
}

// ── Contingencia CAEA (solo admin) ──
export interface CaeaGuardado {
  periodo: string; orden: number; caea: string; vigDesde: string; vigHasta: string; fchTopeInf: string;
}
export interface EstadoCaea {
  configurado: boolean;
  demo?: boolean;
  caeaActivo: boolean;
  ambiente?: "homologacion" | "produccion";
  hoy?: string;
  quincenas: { periodo: string; orden: 1 | 2 }[];
  caeas: CaeaGuardado[];
  pendientes: { id: string; cbte_tipo: number; punto_venta: number; numero: number; fecha: string; total: number; caea: string; caea_error: string | null }[];
}
export const getCaea = () => pedir<EstadoCaea>("/api/afip/caea", "GET");
export const setCaeaActivo = (activo: boolean) => pedir<{ estado: EstadoConfigAfip; caea: EstadoCaea }>("/api/afip/caea", "PATCH", { activo });
export const accionCaea = (body: Record<string, unknown>) => pedir<{ mensaje: string; caea: EstadoCaea }>("/api/afip/caea", "POST", body);

// ── Emision (cualquier rol) ──
/** condicion: del cliente que recibe (solo cuenta si el emisor es responsable inscripto). */
export const facturarVenta = (ventaId: string, documento?: string, condicion?: CondicionReceptor) =>
  pedir<{ factura: FacturaResumen }>("/api/afip/facturar", "POST", { ventaId, documento, condicion }).then((r) => r.factura);
export const reintentarFactura = (facturaId: string) =>
  pedir<{ factura: FacturaResumen }>("/api/afip/reintentar", "POST", { facturaId }).then((r) => r.factura);

// ── Lecturas ──
export const getModoFacturacion = () =>
  consultar<{ activo: boolean; modo: "manual" | "automatico"; demo?: boolean; condicionIva?: CondicionEmisor }>("/api/consultas/facturas", "modo");
export const getFacturasDeVentas = (ventaIds: string[]) =>
  consultar<{ facturas: FacturaResumen[] }>("/api/consultas/facturas", "deVentas", { ventaIds }).then((r) => r.facturas);
export const getComprobante = (facturaId: string) =>
  consultar<Comprobante>("/api/consultas/facturas", "comprobante", { facturaId });
