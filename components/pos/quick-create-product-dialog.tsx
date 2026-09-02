"use client";

import { useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupNombrePorCodigoBarras } from "@/lib/barcode-lookup";
import { createProduct, findProductByCode } from "@/services/products-service";
import type { Product } from "@/lib/types";

interface QuickCreateProductDialogProps {
  open: boolean;
  codigoBarras: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (product: Product) => void;
  /** Si es true, permite editar el código de barras (usado en Stock, sin cámara). */
  codigoEditable?: boolean;
}

export function QuickCreateProductDialog({
  open, codigoBarras, onOpenChange, onCreated, codigoEditable,
}: QuickCreateProductDialogProps) {
  const [codigo, setCodigo] = useState(codigoBarras);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [buscandoNombre, setBuscandoNombre] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCodigo(codigoBarras);
    setName("");
    setPrice("");
    setStock("");
    if (codigoBarras) {
      setBuscandoNombre(true);
      lookupNombrePorCodigoBarras(codigoBarras)
        .then((n) => n && setName(n))
        .finally(() => setBuscandoNombre(false));
    }
  }, [open, codigoBarras]);

  const nombreInvalido = !name.trim();
  const priceNum = Number(price) || 0;

  const handleGuardar = async () => {
    if (nombreInvalido) return;
    setSaving(true);
    try {
      await createProduct({
        name: name.trim(),
        price: priceNum,
        stock: Number(stock) || 0,
        codigoBarras: codigo.trim() || undefined,
      });
      const creado = codigo.trim() ? await findProductByCode(codigo.trim()) : null;
      onOpenChange(false);
      if (creado) onCreated(creado);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-primary" /> Producto nuevo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs">Código de barra</Label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              readOnly={!codigoEditable}
              className="rounded-xl"
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={buscandoNombre ? "Buscando nombre..." : "Nombre del producto"}
              className="rounded-xl"
              autoFocus
            />
            {nombreInvalido && <p className="mt-1 text-xs text-destructive">El nombre es obligatorio</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Precio de venta</Label>
              <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Stock inicial</Label>
              <Input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" className="rounded-xl" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={saving || nombreInvalido} onClick={handleGuardar}>
            {saving ? "Guardando..." : "Guardar y continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
