"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { consultarEstadoPago, type CobroQR, type EstadoPagoQR } from "@/services/mercadopago-service";

/** Cuanto espera el dialogo antes de darse por vencido. */
const ESPERA_MAX_MS = 5 * 60 * 1000;

interface MercadoPagoQrDialogProps {
  cobro: CobroQR | null;
  total: number;
  onOpenChange: (open: boolean) => void;
  onAprobado: (ventaId: string) => void;
}

export function MercadoPagoQrDialog({ cobro, total, onOpenChange, onAprobado }: MercadoPagoQrDialogProps) {
  const [estado, setEstado] = useState<EstadoPagoQR>("pendiente");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [expirado, setExpirado] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!cobro) return;
    setEstado("pendiente");
    setErrorMotivo(null);
    setExpirado(false);
    const vence = Date.now() + ESPERA_MAX_MS;

    intervalRef.current = setInterval(async () => {
      // Sin limite de tiempo el dialogo queda girando para siempre y traba la caja.
      if (Date.now() > vence) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setExpirado(true);
        return;
      }
      try {
        const res = await consultarEstadoPago(cobro.externalReference);
        setEstado(res.estado);
        setErrorMotivo(res.errorMotivo);
        if (res.estado === "aprobado" && res.ventaId) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onAprobado(res.ventaId);
        } else if (res.estado === "rechazado" || res.estado === "cancelado" || res.estado === "error") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // se reintenta en el proximo tick
      }
    }, 2500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cobro, onAprobado]);

  if (!cobro) return null;

  return (
    <Dialog open={!!cobro} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cobrar con Mercado Pago</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="cifra text-2xl font-bold text-money">{formatCurrency(total)}</p>

          {estado === "pendiente" && !expirado && (
            <>
              <img src={cobro.qrDataUrl} alt="QR de pago" className="h-64 w-64 rounded-xl border" />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Esperando que el cliente pague...
              </p>
            </>
          )}
          {estado === "aprobado" && (
            <p className="flex items-center gap-2 text-lg font-semibold text-money">
              <CheckCircle2 className="h-6 w-6" /> Pago aprobado
            </p>
          )}
          {(estado === "rechazado" || estado === "cancelado") && (
            <p className="flex items-center gap-2 text-lg font-semibold text-destructive">
              <XCircle className="h-6 w-6" /> Pago {estado === "rechazado" ? "rechazado" : "cancelado"}
            </p>
          )}
          {expirado && estado === "pendiente" && (
            <div className="space-y-1 text-center">
              <p className="flex items-center justify-center gap-2 text-lg font-semibold text-warning">
                <AlertTriangle className="h-6 w-6" /> Se agotó la espera
              </p>
              <p className="text-sm text-muted-foreground">
                Pasaron 5 minutos sin que se complete el pago. Podés cerrar y cobrar de otra forma.
                Si el cliente igual termina pagando el QR, la venta se registra sola.
              </p>
            </div>
          )}

          {estado === "error" && (
            <div className="space-y-1 text-center">
              <p className="flex items-center justify-center gap-2 text-lg font-semibold text-destructive">
                <AlertTriangle className="h-6 w-6" /> Se cobró, pero no se registró
              </p>
              <p className="text-sm font-medium text-destructive">
                El pago entró en Mercado Pago y la venta NO quedó cargada. Anotala a mano o devolvé el pago.
              </p>
              {errorMotivo && <p className="text-xs text-muted-foreground">Motivo: {errorMotivo}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            {estado === "pendiente" && !expirado ? "Cancelar" : "Cerrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
