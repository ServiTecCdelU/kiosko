"use client";

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal } from "@/lib/pricing";
import type { OfertaTipo, Product } from "@/lib/types";
import type { SetOfertaInput } from "@/services/products-service";

interface OfertaDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (oferta: SetOfertaInput) => Promise<void>;
}

const TIPOS: { value: OfertaTipo; label: string }[] = [
  { value: "monto", label: "Monto ($)" },
  { value: "porcentaje", label: "Porcentaje (%)" },
];

export function OfertaDialog({ product, open, onOpenChange, onSubmit }: OfertaDialogProps) {
  const [activa, setActiva] = useState(false);
  const [tipo, setTipo] = useState<OfertaTipo>("monto");
  const [valor, setValor] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open && product) {
      setActiva(product.ofertaActiva);
      setTipo(product.ofertaTipo ?? "monto");
      setValor(product.ofertaValor ? String(product.ofertaValor) : "");
    }
  }, [open, product]);

  if (!product) return null;

  const valorNum = Number(valor) || 0;
  const preview = precioFinal({
    price: product.price,
    ofertaActiva: activa,
    ofertaTipo: tipo,
    ofertaValor: valorNum,
  });
  const valorInvalido =
    activa && (valorNum <= 0 || (tipo === "porcentaje" && valorNum >= 100));

  const handle = async () => {
    if (valorInvalido) return;
    setWorking(true);
    try {
      await onSubmit({ activa, tipo, valor: valorNum });
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 line-clamp-2">
            <Tag className="h-4 w-4 text-money" /> Oferta · {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
            <span className="text-sm font-medium">Producto en oferta</span>
            <Switch checked={activa} onCheckedChange={setActiva} />
          </label>

          {activa && (
            <>
              <div className="grid grid-cols-2 gap-2">
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
                  {tipo === "monto" ? "Descuento en pesos" : "Descuento en %"}
                </label>
                <Input
                  type="number" inputMode="decimal" autoFocus
                  value={valor} onChange={(e) => setValor(e.target.value)}
                  placeholder={tipo === "monto" ? "Ej: 200" : "Ej: 15"}
                  className="rounded-xl"
                />
                {valorInvalido && (
                  <p className="mt-1 text-xs text-destructive">
                    {tipo === "porcentaje" ? "Debe ser entre 0 y 100" : "Debe ser mayor a 0"}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">Precio final</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground line-through">
                    {formatCurrency(product.price)}
                  </span>
                  <span className="cifra text-lg font-bold text-money">{formatCurrency(preview)}</span>
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={working || valorInvalido} onClick={handle}>
            {working ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
