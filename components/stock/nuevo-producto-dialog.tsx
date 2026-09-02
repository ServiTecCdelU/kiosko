"use client";

import { useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createProduct, type CreateProductInput } from "@/services/products-service";
import type { Product } from "@/lib/types";

interface NuevoProductoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NuevoProductoDialog({ open, onOpenChange, onCreated }: NuevoProductoDialogProps) {
  const [codigo, setCodigo] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [costo, setCosto] = useState("");
  const [stock, setStock] = useState("");
  const [stockMinimo, setStockMinimo] = useState("");
  const [lote, setLote] = useState("");
  const [favorito, setFavorito] = useState(false);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [unidad, setUnidad] = useState<"un" | "kg">("un");
  const [stockControlado, setStockControlado] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCodigo("");
    setCodigoBarras("");
    setName("");
    setCategory("");
    setPrice("");
    setCosto("");
    setStock("");
    setStockMinimo("");
    setLote("");
    setFavorito(false);
    setFechaVencimiento("");
    setUnidad("un");
    setStockControlado(true);
  }, [open]);

  const priceNum = Number(price) || 0;
  const costoNum = costo ? Number(costo) || 0 : undefined;
  const margenPct = costoNum && priceNum > 0 ? ((priceNum - costoNum) / priceNum) * 100 : undefined;
  const nombreInvalido = !name.trim();

  const handleGuardar = async () => {
    if (nombreInvalido) return;
    setSaving(true);
    try {
      const input: CreateProductInput = {
        name: name.trim(),
        price: priceNum,
        stock: Number(stock) || 0,
        codigo: codigo.trim() || undefined,
        codigoBarras: codigoBarras.trim() || undefined,
        category: category.trim() || undefined,
        costo: costoNum,
        stockMinimo: Number(stockMinimo) || 0,
        lote: lote ? Number(lote) : undefined,
        unidad,
        fechaVencimiento: fechaVencimiento || undefined,
        favorito,
        stockControlado,
      };
      await createProduct(input);
      onOpenChange(false);
      onCreated();
    } catch (e) {
      // el toast de error lo maneja quien llama, esto solo evita cerrar en error
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-primary" /> Producto nuevo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Código de barra</Label>
              <Input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Código interno</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del producto"
              className="rounded-xl"
              autoFocus
            />
            {nombreInvalido && <p className="mt-1 text-xs text-destructive">El nombre es obligatorio</p>}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Rubro / Subrubro</Label>
            <Input
              value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej: Almacén / Galletitas" className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Precio de venta</Label>
              <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Costo</Label>
              <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Opcional" className="rounded-xl" />
            </div>
          </div>

          {margenPct !== undefined && (
            <div className={cn(
              "rounded-xl px-3 py-2 text-sm",
              margenPct < 0 ? "bg-destructive/10 text-destructive" : "bg-money/10 text-money",
            )}>
              Margen: <strong>{margenPct.toFixed(1)}%</strong>
              {margenPct < 0 && " — estás vendiendo por debajo del costo"}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Stock inicial</Label>
              <Input type="number" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Stock mínimo</Label>
              <Input type="number" inputMode="numeric" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Lote</Label>
              <Input type="number" inputMode="numeric" value={lote} onChange={(e) => setLote(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Se vende por</Label>
              <select
                value={unidad}
                onChange={(e) => setUnidad(e.target.value as "un" | "kg")}
                className="border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="un">Unidad</option>
                <option value="kg">Peso (kg)</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Fecha de vencimiento</Label>
              <Input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Producto rápido (grilla del POS)</span>
              <Switch checked={favorito} onCheckedChange={setFavorito} />
            </label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">
                Es un servicio (sin stock)
                <span className="block text-xs font-normal text-muted-foreground">
                  Ej: recarga de celular, fotocopias — se cobra pero no descuenta stock
                </span>
              </span>
              <Switch checked={!stockControlado} onCheckedChange={(v) => setStockControlado(!v)} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={saving || nombreInvalido} onClick={handleGuardar}>
            {saving ? "Guardando..." : "Guardar producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
