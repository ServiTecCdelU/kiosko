"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import {
  listarCobrosSinResolver,
  resolverCobro,
  type CobroSinResolver,
} from "@/services/mercadopago-service";

/**
 * Cobros de Mercado Pago que quedaron sin cerrar. Solo se dibuja si hay
 * alguno: el dia normal esta vacio y no tiene que ocupar lugar.
 *
 * Los dos casos son muy distintos y conviene no mezclarlos:
 *  - error     : la plata ENTRO y la venta no quedo registrada. Urgente.
 *  - pendiente : se genero un cobro y nunca se confirmo. Casi siempre el
 *                cliente se arrepintio; se limpia para sacar ruido.
 */
export function CobrosSinResolver() {
  const [cobros, setCobros] = useState<CobroSinResolver[]>([]);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCobros(await listarCobrosSinResolver());
    } catch {
      // Silencioso: es un panel secundario, no debe romper la pantalla de caja.
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcarResuelto = async (c: CobroSinResolver) => {
    setTrabajando(c.id);
    try {
      await resolverCobro(c.id);
      toast.success("Cobro marcado como resuelto");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo marcar como resuelto");
    } finally {
      setTrabajando(null);
    }
  };

  if (cobros.length === 0) return null;

  const conError = cobros.filter((c) => c.estado === "error");
  const colgados = cobros.filter((c) => c.estado !== "error");

  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h2 className="font-semibold">Cobros de Mercado Pago sin resolver</h2>
      </div>

      {conError.length > 0 && (
        <div className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-semibold">
            {conError.length === 1
              ? "Hay 1 pago cobrado sin venta registrada"
              : `Hay ${conError.length} pagos cobrados sin venta registrada`}
          </p>
          <p className="mt-0.5">
            La plata entró en Mercado Pago pero la venta no quedó cargada. Revisá cada caso:
            cargá la venta a mano, o devolvé el pago desde la app de Mercado Pago.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {[...conError, ...colgados].map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {c.estado === "error" ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">Se cobró, sin venta</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <span className="text-warning">Cobro sin confirmar</span>
                  </>
                )}
                {c.total != null && (
                  <span className="cifra ml-1 font-semibold text-foreground">
                    {formatCurrency(c.total)}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(new Date(c.createdAt))}
                {c.items > 0 && ` · ${c.items} ${c.items === 1 ? "producto" : "productos"}`}
              </p>
              {c.errorMotivo && (
                <p className="mt-0.5 text-xs text-destructive">Motivo: {c.errorMotivo}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {c.paymentId && (
                <a
                  href={`https://www.mercadopago.com.ar/activities/detail/payment/${c.paymentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ver en MP
                </a>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={trabajando === c.id}
                onClick={() => marcarResuelto(c)}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                {trabajando === c.id ? "..." : "Resuelto"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
