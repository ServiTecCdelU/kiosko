"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { consultarEstadoPago, cancelarCobroPoint, ErrorCancelacionPoint, type CobroPoint, type EstadoPagoQR } from "@/services/mercadopago-service";

interface MercadoPagoPointDialogProps {
  cobro: CobroPoint | null;
  total: number;
  onOpenChange: (open: boolean) => void;
  onAprobado: (ventaId: string) => void;
}

export function MercadoPagoPointDialog({ cobro, total, onOpenChange, onAprobado }: MercadoPagoPointDialogProps) {
  const [estado, setEstado] = useState<EstadoPagoQR>("pendiente");
  const [cancelando, setCancelando] = useState(false);
  const [avisoCancelacion, setAvisoCancelacion] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!cobro) return;
    setEstado("pendiente");
    setAvisoCancelacion(null);

    intervalRef.current = setInterval(async () => {
      try {
        const res = await consultarEstadoPago(cobro.externalReference);
        setEstado(res.estado);
        if (res.estado === "aprobado" && res.ventaId) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onAprobado(res.ventaId);
        } else if (res.estado === "rechazado" || res.estado === "cancelado") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        // se reintenta en el proximo tick
      }
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cobro, onAprobado]);

  if (!cobro) return null;

  const handleCancelar = async () => {
    setCancelando(true);
    setAvisoCancelacion(null);
    try {
      await cancelarCobroPoint(cobro.externalReference);
      onOpenChange(false);
    } catch (e) {
      // No se cierra el dialogo: el cobro sigue vivo en el lector y el cliente
      // todavia puede pagar. Si cerraramos, el cajero creeria que se cancelo.
      setAvisoCancelacion(
        e instanceof ErrorCancelacionPoint && e.enTerminal
          ? "El cobro ya está en la pantalla del lector, así que no se puede cancelar desde acá. Cancelalo con la tecla roja del lector; si el cliente igual paga, la venta se registra sola."
          : e instanceof Error
            ? e.message
            : "No se pudo cancelar el cobro",
      );
    } finally {
      setCancelando(false);
    }
  };

  return (
    <Dialog open={!!cobro} onOpenChange={(o) => !o && estado !== "pendiente" && onOpenChange(o)}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cobrando en el lector</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="cifra text-2xl font-bold text-money">{formatCurrency(total)}</p>

          {estado === "pendiente" && (
            <>
              <CreditCard className="h-16 w-16 animate-pulse-soft text-primary" />
              <p className="text-center text-sm text-muted-foreground">
                Pedile al cliente que apoye o inserte la tarjeta en el lector...
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

          {avisoCancelacion && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {avisoCancelacion}
            </p>
          )}
        </div>
        <DialogFooter>
          {estado === "pendiente" ? (
            <Button variant="outline" className="rounded-xl" disabled={cancelando} onClick={handleCancelar}>
              {cancelando ? "Cancelando..." : "Cancelar cobro"}
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
