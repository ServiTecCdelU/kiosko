"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";
import type { Sale } from "@/lib/types";

interface AnularVentaDialogProps {
  venta: Sale | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (motivo: string) => Promise<void>;
}

export function AnularVentaDialog({ venta, onOpenChange, onSubmit }: AnularVentaDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (venta) setMotivo("");
  }, [venta]);

  if (!venta) return null;

  // Anular devuelve el stock y revierte el fiado, pero NO devuelve la plata de
  // Mercado Pago: esa devolucion se hace a mano desde la app de MP.
  const esMercadoPago =
    venta.paymentMethod === "mercadopago" || venta.paymentMethod === "mercadopago_point";

  const handle = async () => {
    setWorking(true);
    try {
      await onSubmit(motivo.trim());
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={!!venta} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Anular venta
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Venta {venta.saleNumber ?? venta.id} por <strong className="text-foreground">{formatCurrency(venta.total)}</strong>.
            El stock se devuelve automáticamente.
          </p>

          {esMercadoPago && (
            <div className="rounded-xl bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
              <p className="font-semibold">Esta venta se cobró por Mercado Pago</p>
              <p className="mt-0.5">
                Anular acá no le devuelve la plata al cliente. La devolución hay que hacerla
                a mano desde la app de Mercado Pago (Actividad → el pago → Devolver).
              </p>
            </div>
          )}

          {venta.paymentMethod === "fiado" && (
            <div className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              Se le va a descontar {formatCurrency(venta.total)} de la deuda al cliente.
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">Motivo (opcional)</Label>
            <Input
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: error de cobro" className="rounded-xl" autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" className="rounded-xl" disabled={working} onClick={handle}>
            {working ? "Anulando..." : "Anular venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
