"use client";

// components/pos/peso-dialog.tsx — cuanto se lleva de un producto fraccionable
// (kg, m o l: lib/unidades.ts). Se tipea la cantidad ("0,350") o el importe
// ("dame $2.000 de almendras"): con importe se calcula la cantidad al gramo
// (o al milimetro / mililitro) y el servidor cobra precio x esa cantidad.
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal } from "@/lib/pricing";
import { cantidadTexto, parseCantidad } from "@/lib/cantidad";
import { cantidadDesdeImporte } from "@/lib/importe";
import { magnitud, simboloUnidad } from "@/lib/unidades";
import type { Product } from "@/lib/types";

interface PesoDialogProps {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (cantidad: number) => void;
}

type Modo = "cantidad" | "importe";

export function PesoDialog({ product, onOpenChange, onConfirm }: PesoDialogProps) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<Modo>("cantidad");

  useEffect(() => {
    if (product) {
      setTexto("");
      setModo("cantidad");
    }
  }, [product]);

  if (!product) return null;

  const simbolo = simboloUnidad(product.unidad);
  const precio = precioFinal(product);
  const numero = parseCantidad(texto) ?? 0;
  const cantidad = modo === "cantidad"
    ? Math.round(numero * 1000) / 1000
    : cantidadDesdeImporte(numero, precio) ?? 0;
  const subtotal = Math.round(cantidad * precio * 100) / 100;

  const handle = () => {
    if (cantidad <= 0) return;
    onConfirm(cantidad);
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
            {formatCurrency(precio)} por {simbolo}
          </p>
          <div className="flex rounded-xl border p-0.5" role="tablist">
            {([
              { valor: "cantidad", label: magnitud(product.unidad) === "peso" ? "Por peso" : `Por ${magnitud(product.unidad)}` },
              { valor: "importe", label: "Por importe ($)" },
            ] as const).map((m) => (
              <button
                key={m.valor}
                type="button"
                role="tab"
                aria-selected={modo === m.valor}
                onClick={() => { setModo(m.valor); setTexto(""); }}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  modo === m.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Input
            type="text" inputMode="decimal" autoFocus
            placeholder={modo === "cantidad" ? `Cantidad en ${simbolo} (ej. ${product.unidad === "kg" ? "0,350" : "2,5"})` : "Importe en $ (ej. 2000)"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            className="rounded-xl text-center text-lg"
          />
          {cantidad > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {modo === "importe" && <>{cantidadTexto(cantidad, product.unidad)} · </>}
              Subtotal: <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={cantidad <= 0} onClick={handle}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
