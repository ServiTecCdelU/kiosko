"use client";

// components/pos/presupuesto-dialog.tsx — guarda el carrito como presupuesto y baja el PDF.
// Los precios los calcula el servidor (app/api/presupuestos), como en la venta.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";
import { precioLinea } from "@/lib/pricing";
import { VALIDEZ_DEFAULT, errorValidez } from "@/lib/presupuesto";
import { descargarPresupuestoPdf } from "@/lib/utils/presupuesto-pdf";
import { crearPresupuesto } from "@/services/presupuestos-service";
import type { CartItem } from "@/lib/types";

interface PresupuestoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  nombreComercio: string;
  /** Se llama con el presupuesto ya guardado (el POS vacia el carrito). */
  onGuardado: () => void;
}

export function PresupuestoDialog({ open, onOpenChange, items, nombreComercio, onGuardado }: PresupuestoDialogProps) {
  const [cliente, setCliente] = useState("");
  const [dias, setDias] = useState(String(VALIDEZ_DEFAULT));
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setCliente("");
      setDias(String(VALIDEZ_DEFAULT));
      setNotas("");
    }
  }, [open]);

  const diasNum = Number(dias);
  const errorDias = errorValidez(diasNum);
  const total = items.reduce((s, i) => s + precioLinea(i.product, i.quantity), 0);

  const guardar = async () => {
    if (errorDias || items.length === 0) return;
    setGuardando(true);
    try {
      const p = await crearPresupuesto({
        items: items.map((i) => ({ productId: i.product.id, name: i.product.name, quantity: i.quantity, price: i.product.price })),
        clienteNombre: cliente.trim() || undefined,
        validezDias: diasNum,
        notas: notas.trim() || undefined,
      });
      descargarPresupuestoPdf(p, nombreComercio);
      toast.success(`Presupuesto N° ${p.numero} guardado`, { description: "Lo encontrás en Presupuestos para pasarlo a venta." });
      onOpenChange(false);
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el presupuesto");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Presupuesto</DialogTitle>
          <DialogDescription>
            {items.length} producto{items.length === 1 ? "" : "s"} · {formatCurrency(total)}. No descuenta stock;
            mientras esté vigente se respetan estos precios.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Cliente (opcional)</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej: Juan Pérez / Constructora" className="rounded-xl" autoFocus />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Válido por (días)</Label>
            <Input type="number" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className="rounded-xl" />
            {dias.trim() && errorDias && <p className="mt-1 text-xs text-destructive">{errorDias}</p>}
          </div>
          <div>
            <Label className="mb-1 block text-xs">Nota (opcional)</Label>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: entrega a domicilio a convenir" className="rounded-xl" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={!!errorDias || guardando || items.length === 0} onClick={guardar}>
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar y bajar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
