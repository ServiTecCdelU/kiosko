"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

type Tipo = "entrada" | "ajuste" | "rotura";

interface AjusteDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (tipo: Tipo, cantidad: number) => Promise<void>;
}

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "ajuste", label: "Ajuste" },
  { value: "rotura", label: "Rotura" },
];

export function AjusteDialog({ product, open, onOpenChange, onSubmit }: AjusteDialogProps) {
  const [tipo, setTipo] = useState<Tipo>("entrada");
  const [cantidad, setCantidad] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("entrada");
      setCantidad("");
    }
  }, [open]);

  if (!product) return null;

  const handle = async () => {
    const n = Number(cantidad);
    if (!Number.isFinite(n)) return;
    setWorking(true);
    try {
      await onSubmit(tipo, n);
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Stock actual: <span className="font-semibold text-foreground">{product.stock}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                className={cn(
                  "rounded-xl border py-2 text-sm font-medium transition-colors",
                  tipo === t.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {tipo === "ajuste" ? "Nuevo stock total" : "Cantidad"}
            </label>
            <Input
              type="number" inputMode="decimal" autoFocus
              value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={working || cantidad === ""} onClick={handle}>
            {working ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
