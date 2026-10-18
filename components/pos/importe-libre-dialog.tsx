"use client";

// components/pos/importe-libre-dialog.tsx — importe de un producto a precio libre
// (recarga SUBE, fotocopias, "varios"). El servidor acepta ese importe solo para
// productos marcados con precio libre (lib/server/procesar-venta.ts).
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/format";
import { parseCantidad } from "@/lib/cantidad";
import { errorPrecioLibre } from "@/lib/venta-validacion";
import type { Product } from "@/lib/types";

interface ImporteLibreDialogProps {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (importe: number) => void;
}

export function ImporteLibreDialog({ product, onOpenChange, onConfirm }: ImporteLibreDialogProps) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (product) setTexto("");
  }, [product]);

  if (!product) return null;

  const importe = parseCantidad(texto) ?? 0;
  const error = texto.trim() ? errorPrecioLibre(importe, product.name) : null;
  const valido = importe > 0 && !error;

  const handle = () => {
    if (!valido) return;
    onConfirm(Math.round(importe * 100) / 100);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{product.name}</DialogTitle>
          <DialogDescription>Precio libre: tipeá cuánto se cobra.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            type="text" inputMode="decimal" autoFocus
            placeholder="Importe en $ (ej. 5000)" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            className="rounded-xl text-center text-lg"
          />
          {error ? (
            <p className="text-center text-sm text-destructive">{error}</p>
          ) : valido ? (
            <p className="text-center text-sm text-muted-foreground">
              Se cobra <span className="font-semibold text-foreground">{formatCurrency(importe)}</span>
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={!valido} onClick={handle}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
