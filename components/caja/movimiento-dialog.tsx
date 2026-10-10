"use client";

// components/caja/movimiento-dialog.tsx — retiro, aporte o gasto de caja.
// Los gastos llevan categoria (lib/gastos.ts) para el reporte "Gastos por categoria".
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CATEGORIAS_GASTO, type GastoCategoria } from "@/lib/gastos";
import type { CajaMovTipo } from "@/lib/types";

interface MovimientoDialogProps {
  tipo: CajaMovTipo | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (monto: number, concepto: string, categoria?: GastoCategoria) => Promise<void>;
}

const LABELS: Record<CajaMovTipo, { titulo: string; placeholder: string; color: string }> = {
  retiro: { titulo: "Retiro de caja", placeholder: "Ej: retiro del dueño", color: "text-warning" },
  aporte: { titulo: "Aporte a caja", placeholder: "Ej: reposición de cambio", color: "text-money" },
  gasto: { titulo: "Gasto", placeholder: "Ej: factura de luz de octubre", color: "text-destructive" },
};

export function MovimientoDialog({ tipo, onOpenChange, onSubmit }: MovimientoDialogProps) {
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState<GastoCategoria>("otros");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (tipo) {
      setMonto("");
      setConcepto("");
      setCategoria("otros");
    }
  }, [tipo]);

  if (!tipo) return null;
  const info = LABELS[tipo];
  const montoNum = Number(monto) || 0;

  const handle = async () => {
    if (montoNum <= 0) return;
    setWorking(true);
    try {
      await onSubmit(montoNum, concepto.trim(), tipo === "gasto" ? categoria : undefined);
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
          {tipo === "gasto" && (
            <div>
              <Label className="mb-1 block text-xs">Categoría</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {CATEGORIAS_GASTO.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategoria(c.value)}
                    title={c.ayuda}
                    className={cn(
                      "rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors",
                      categoria === c.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {CATEGORIAS_GASTO.find((c) => c.value === categoria)?.ayuda}. Los pagos a proveedores se cargan en Compras → Cuenta corriente.
              </p>
            </div>
          )}
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
