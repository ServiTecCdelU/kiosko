"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal } from "@/lib/pricing";
import type { Product } from "@/lib/types";

interface PesoDialogProps {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (kg: number) => void;
}

export function PesoDialog({ product, onOpenChange, onConfirm }: PesoDialogProps) {
  const [kg, setKg] = useState("");

  useEffect(() => {
    if (product) setKg("");
  }, [product]);

  if (!product) return null;

  const kgNum = Number(kg) || 0;
  const subtotal = kgNum * precioFinal(product);

  const handle = () => {
    if (kgNum <= 0) return;
    onConfirm(kgNum);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {formatCurrency(precioFinal(product))} por kg
          </p>
          <Input
            type="number" inputMode="decimal" step="0.01" autoFocus
            placeholder="Peso en kg" value={kg}
            onChange={(e) => setKg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            className="rounded-xl text-center text-lg"
          />
          {kgNum > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Subtotal: <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={kgNum <= 0} onClick={handle}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
