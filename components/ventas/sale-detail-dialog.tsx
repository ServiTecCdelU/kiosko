"use client";

import { Ban, Receipt } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { metodoLabel, metodoColorClass } from "@/lib/utils/metodo-pago";
import type { Sale } from "@/lib/types";

interface SaleDetailDialogProps {
  venta: Sale | null;
  onOpenChange: (open: boolean) => void;
  esAdmin: boolean;
  onAnular: (venta: Sale) => void;
}

export function SaleDetailDialog({ venta, onOpenChange, esAdmin, onAnular }: SaleDetailDialogProps) {
  if (!venta) return null;

  return (
    <Dialog open={!!venta} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Venta {venta.saleNumber ?? venta.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{formatDateTime(venta.createdAt)}</span>
            {venta.estado === "anulada" && (
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                <Ban className="mr-1 h-3 w-3" /> Anulada
              </Badge>
            )}
          </div>

          <div className="divide-y rounded-xl border">
            {venta.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number.isInteger(it.quantity) ? it.quantity : it.quantity.toFixed(2)} x {formatCurrency(it.price)}
                  </p>
                </div>
                <span className="cifra shrink-0 font-semibold">{formatCurrency(it.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="cifra text-money text-lg font-bold">{formatCurrency(venta.total)}</span>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pago</span>
              <Badge className={metodoColorClass(venta.paymentMethod)}>{metodoLabel(venta.paymentMethod)}</Badge>
            </div>
            {venta.pagadorNombre && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pagó</span>
                <span className="font-medium">{venta.pagadorNombre}</span>
              </div>
            )}
            {venta.paymentMethod === "credito" && venta.cuotas && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cuotas</span>
                <span className="font-medium">{venta.cuotas}{venta.recargoPct ? ` (+${venta.recargoPct}% recargo)` : ""}</span>
              </div>
            )}
            {venta.userName && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cajero</span>
                <span className="font-medium">{venta.userName}</span>
              </div>
            )}
            {venta.motivoAnulacion && (
              <div className="rounded-xl bg-destructive/10 px-3 py-2 text-destructive">
                Motivo: {venta.motivoAnulacion}
                {venta.anuladaPorNombre && ` · ${venta.anuladaPorNombre}`}
              </div>
            )}
          </div>
        </div>

        {esAdmin && venta.estado !== "anulada" && (
          <DialogFooter>
            <Button variant="destructive" className="w-full rounded-xl sm:w-auto" onClick={() => onAnular(venta)}>
              Anular venta
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
