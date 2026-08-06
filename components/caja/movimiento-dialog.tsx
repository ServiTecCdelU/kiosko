"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CajaMovTipo } from "@/lib/types";

interface MovimientoDialogProps {
  tipo: CajaMovTipo | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (monto: number, concepto: string) => Promise<void>;
}

const LABELS: Record<CajaMovTipo, { titulo: string; placeholder: string; color: string }> = {
  retiro: { titulo: "Retiro de caja", placeholder: "Ej: retiro del dueño", color: "text-warning" },
  aporte: { titulo: "Aporte a caja", placeholder: "Ej: reposición de cambio", color: "text-money" },
  gasto: { titulo: "Gasto", placeholder: "Ej: pago a proveedor de gaseosas", color: "text-destructive" },
};

export function MovimientoDialog({ tipo, onOpenChange, onSubmit }: MovimientoDialogProps) {
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (tipo) {
      setMonto("");
      setConcepto("");
    }
  }, [tipo]);

  if (!tipo) return null;
  const info = LABELS[tipo];
  const montoNum = Number(monto) || 0;

  const handle = async () => {
    if (montoNum <= 0) return;
    setWorking(true);
    try {
      await onSubmit(montoNum, concepto.trim());
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={!!tipo} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className={cn(info.color)}>{info.titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Monto</Label>
            <Input
              type="number" inputMode="decimal" autoFocus
              value={monto} onChange={(e) => setMonto(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Concepto</Label>
            <Input
              value={concepto} onChange={(e) => setConcepto(e.target.value)}
              placeholder={info.placeholder} className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={working || montoNum <= 0} onClick={handle}>
            {working ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
