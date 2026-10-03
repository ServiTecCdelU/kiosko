"use client";

// components/facturacion/factura-venta.tsx — la factura electronica de una venta:
// seccion del detalle (Facturar / Reintentar / Imprimir, notas de credito) y
// badge para la tabla de Ventas. Solo aparece si el comercio factura.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileCheck2, FileWarning, Loader2, Printer, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { CBTE, NOMBRE_CBTE, UMBRAL_IDENTIFICACION } from "@/lib/afip/constantes";
import { numeroComprobante } from "@/lib/afip/comprobante";
import { useImprimirComprobante } from "@/components/facturacion/comprobante-fiscal";
import {
  facturarVenta, getFacturasDeVentas, getModoFacturacion, reintentarFactura, type FacturaResumen,
} from "@/services/facturacion-service";

/** Si el comercio tiene la facturacion activa (una consulta por pantalla). */
export function useFacturacionActiva(): boolean {
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    getModoFacturacion().then((m) => setActiva(m.activo)).catch(() => setActiva(false));
  }, []);
  return activa;
}

/** Facturas de las ventas listadas, agrupadas por venta. */
export function useFacturasPorVenta(ventaIds: string[], activa: boolean) {
  const [porVenta, setPorVenta] = useState<Map<string, FacturaResumen[]>>(new Map());
  const clave = ventaIds.join(",");

  const cargar = useCallback(async () => {
    if (!activa || !clave) return setPorVenta(new Map());
    try {
      const facturas = await getFacturasDeVentas(clave.split(","));
      const mapa = new Map<string, FacturaResumen[]>();
      for (const f of facturas) mapa.set(f.venta_id!, [...(mapa.get(f.venta_id!) ?? []), f]);
      setPorVenta(mapa);
    } catch {
      // sin el estado de facturas la pantalla de ventas sigue funcionando
    }
  }, [clave, activa]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { porVenta, recargar: cargar };
}

const facturaDe = (fs: FacturaResumen[] | undefined) =>
  fs?.filter((f) => f.cbte_tipo === CBTE.FACTURA_C && f.estado !== "rechazada").at(-1);

export function FacturaBadge({ facturas }: { facturas: FacturaResumen[] | undefined }) {
  const f = facturaDe(facturas);
  if (!f) return null;
  if (f.estado === "autorizada") {
    return <Badge variant="outline" className="border-success/50 text-success" title={`CAE ${f.cae}`}>FC {f.numero}</Badge>;
  }
  return <Badge variant="outline" className="border-destructive/50 text-destructive" title={f.error ?? ""}>FC con error</Badge>;
}

const ESTADO_TEXTO: Record<FacturaResumen["estado"], string> = {
  autorizada: "Autorizada",
  pendiente: "Pendiente",
  rechazada: "Rechazada",
  error: "Con error",
};

interface FacturaVentaSeccionProps {
  ventaId: string;
  total: number;
  anulada: boolean;
  onCambio?: () => void;
}

export function FacturaVentaSeccion({ ventaId, total, anulada, onCambio }: FacturaVentaSeccionProps) {
  const activa = useFacturacionActiva();
  const [facturas, setFacturas] = useState<FacturaResumen[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [documento, setDocumento] = useState("");
  const { imprimir, cargando, elemento } = useImprimirComprobante();

  const cargar = useCallback(async () => {
    setFacturas(await getFacturasDeVentas([ventaId]).catch(() => []));
  }, [ventaId]);

  useEffect(() => {
    if (activa) cargar();
  }, [activa, cargar]);

  if (!activa || facturas === null) return null;

  const viva = facturaDe(facturas);
  const necesitaDocumento = total >= UMBRAL_IDENTIFICACION;

  const accion = async (fn: () => Promise<FacturaResumen>, exito: string) => {
    setTrabajando(true);
    try {
      const f = await fn();
      if (f.estado === "autorizada") toast.success(exito);
      else toast.error(f.error ?? "AFIP no autorizó el comprobante");
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Factura electrónica</p>

      {facturas.length === 0 && <p className="text-sm text-muted-foreground">Esta venta no está facturada.</p>}

      {facturas.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5">
            {f.estado === "autorizada" ? <FileCheck2 className="h-4 w-4 text-success" /> : <FileWarning className="h-4 w-4 text-destructive" />}
            {NOMBRE_CBTE[f.cbte_tipo]} {f.numero ? numeroComprobante(f.punto_venta, f.numero) : ""}
            <span className="cifra text-muted-foreground">{formatCurrency(f.total)}</span>
            <span className={cn("text-xs", f.estado === "autorizada" ? "text-success" : "text-destructive")}>{ESTADO_TEXTO[f.estado]}</span>
            {f.ambiente === "homologacion" && <span className="text-xs text-warning">(prueba)</span>}
          </span>
          <span className="flex gap-1.5">
            {f.estado === "autorizada" && (
              <Button size="sm" variant="outline" className="h-7 rounded-lg" disabled={cargando} onClick={() => imprimir(f.id)}>
                <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
              </Button>
            )}
            {(f.estado === "error" || f.estado === "pendiente") && (
              <Button size="sm" variant="outline" className="h-7 rounded-lg" disabled={trabajando} onClick={() => accion(() => reintentarFactura(f.id), "Comprobante autorizado")}>
                <RotateCw className="mr-1 h-3.5 w-3.5" /> Reintentar
              </Button>
            )}
          </span>
          {f.error && f.estado !== "autorizada" && <p className="w-full text-xs text-destructive">{f.error}</p>}
        </div>
      ))}

      {!viva && !anulada && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder={necesitaDocumento ? "DNI o CUIT del cliente (obligatorio)" : "DNI o CUIT del cliente (opcional)"}
            className="h-9 rounded-xl"
            inputMode="numeric"
            maxLength={20}
          />
          <Button
            className="h-9 shrink-0 rounded-xl"
            disabled={trabajando || (necesitaDocumento && !documento.trim())}
            onClick={() => accion(() => facturarVenta(ventaId, documento.trim() || undefined), "Factura autorizada por AFIP")}
          >
            {trabajando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Facturar
          </Button>
        </div>
      )}
      {elemento}
    </div>
  );
}
