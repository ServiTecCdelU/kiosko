"use client";

import { PauseCircle, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { precioLinea } from "@/lib/pricing";
import type { TicketEnEspera } from "@/lib/utils/tickets-espera";

interface TicketsEsperaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: TicketEnEspera[];
  onRecuperar: (ticket: TicketEnEspera) => void;
  onDescartar: (id: string) => void;
}

export function TicketsEsperaDialog({
  open, onOpenChange, tickets, onRecuperar, onDescartar,
}: TicketsEsperaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 text-primary" /> Ventas en espera
          </DialogTitle>
        </DialogHeader>
        {tickets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay carritos suspendidos</p>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => {
              const total = t.items.reduce((s, i) => s + precioLinea(i.product, i.quantity), 0);
              return (
                <li key={t.id} className="rounded-xl border p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t.nota || "Sin nota"}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.items.length} producto{t.items.length !== 1 && "s"} · {formatCurrency(total)}
                      </p>
                    </div>
                    <button
                      onClick={() => onDescartar(t.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Descartar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Button size="sm" className="w-full rounded-lg" onClick={() => onRecuperar(t)}>
                    Recuperar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
