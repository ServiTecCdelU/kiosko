// services/facturacion-service.ts — facturacion electronica AFIP/ARCA (client helper).
import { consultar } from "@/services/api-client";
import { apiUrl } from "@/lib/utils/api-url";
import { descargarBlob } from "@/lib/utils/descargar";

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
}

export interface EstadoConfigAfip {
  configurado: boolean;
  demo?: boolean;
  cuit?: string;
  razonSocial?: string;
  domicilio?: string;
  inicioActividades?: string;
  ingresosBrutos?: string | null;
  puntoVenta?: number | null;
  ambiente?: "homologacion" | "produccion";
  modo?: "manual" | "automatico";
  activo?: boolean;
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
    docTipo: number; docNro: string; receptorNombre: string | null; cae: string; caeVto: string;
    ambiente: "homologacion" | "produccion";
    asociado: { cbteTipo: number; puntoVenta: number; numero: number } | null;
    items: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
    qr: string;
  };
  emisor: { razonSocial: string; cuit: string; domicilio: string; ingresosBrutos: string | null; inicioActividades: string };
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

// ── Emision (cualquier rol) ──
export const facturarVenta = (ventaId: string, documento?: string) =>
  pedir<{ factura: FacturaResumen }>("/api/afip/facturar", "POST", { ventaId, documento }).then((r) => r.factura);
export const reintentarFactura = (facturaId: string) =>
  pedir<{ factura: FacturaResumen }>("/api/afip/reintentar", "POST", { facturaId }).then((r) => r.factura);

// ── Lecturas ──
export const getModoFacturacion = () =>
  consultar<{ activo: boolean; modo: "manual" | "automatico"; demo?: boolean }>("/api/consultas/facturas", "modo");
export const getFacturasDeVentas = (ventaIds: string[]) =>
  consultar<{ facturas: FacturaResumen[] }>("/api/consultas/facturas", "deVentas", { ventaIds }).then((r) => r.facturas);
export const getComprobante = (facturaId: string) =>
  consultar<Comprobante>("/api/consultas/facturas", "comprobante", { facturaId });
