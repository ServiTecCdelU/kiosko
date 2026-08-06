"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import type { UpdateProductInput } from "@/services/products-service";

type AjusteTipo = "entrada" | "ajuste" | "rotura";

interface EditarProductoDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UpdateProductInput) => Promise<void>;
  onAjustarStock: (tipo: AjusteTipo, cantidad: number) => Promise<void>;
}

const AJUSTE_TIPOS: { value: AjusteTipo; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "ajuste", label: "Ajuste" },
  { value: "rotura", label: "Rotura" },
];

export function EditarProductoDialog({
  product, open, onOpenChange, onSave, onAjustarStock,
}: EditarProductoDialogProps) {
  const [codigo, setCodigo] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [costo, setCosto] = useState("");
  const [stockMinimo, setStockMinimo] = useState("");
  const [lote, setLote] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [revisar, setRevisar] = useState(false);
  const [saving, setSaving] = useState(false);

  const [ajusteTipo, setAjusteTipo] = useState<AjusteTipo>("entrada");
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [ajustando, setAjustando] = useState(false);

  useEffect(() => {
    if (open && product) {
      setCodigo(product.codigo ?? "");
      setCodigoBarras(product.codigoBarras ?? "");
      setName(product.name);
      setCategory(product.category ?? "");
      setPrice(String(product.price));
      setCosto(product.precioBase ? String(product.precioBase) : "");
      setStockMinimo(String(product.stockMinimo));
      setLote(product.lote ? String(product.lote) : "");
      setDisabled(product.disabled);
      setRevisar(product.revisar);
      setAjusteTipo("entrada");
      setAjusteCantidad("");
    }
  }, [open, product]);

  if (!product) return null;

  const priceNum = Number(price) || 0;
  const costoNum = costo ? Number(costo) || 0 : undefined;
  const margenPct = costoNum && priceNum > 0 ? ((priceNum - costoNum) / priceNum) * 100 : undefined;
  const stockMinimoNum = Number(stockMinimo) || 0;
  const loteNum = lote ? Number(lote) : undefined;
  const nombreInvalido = !name.trim();

  const handleSave = async () => {
    if (nombreInvalido) return;
    setSaving(true);
    try {
      await onSave({
        codigo: codigo.trim(),
        codigoBarras: codigoBarras.trim(),
        name: name.trim(),
        category: category.trim(),
        price: priceNum,
        costo: costoNum,
        stockMinimo: stockMinimoNum,
        lote: loteNum,
        disabled,
        revisar,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAjustar = async () => {
    const n = Number(ajusteCantidad);
    if (!Number.isFinite(n) || ajusteCantidad === "") return;
    setAjustando(true);
    try {
      await onAjustarStock(ajusteTipo, n);
      setAjusteCantidad("");
    } finally {
      setAjustando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 line-clamp-2">
            <Pencil className="h-4 w-4 text-primary" /> Editar producto
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
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Stock mínimo</Label>
              <Input type="number" inputMode="numeric" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Lote</Label>
              <Input type="number" inputMode="numeric" value={lote} onChange={(e) => setLote(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex flex-1 items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Deshabilitado</span>
              <Switch checked={disabled} onCheckedChange={setDisabled} />
            </label>
            <label className="flex flex-1 items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">A revisar</span>
              <Switch checked={revisar} onCheckedChange={setRevisar} />
            </label>
          </div>

          <div className="rounded-xl border p-3">
            <p className="mb-2 text-sm font-medium">
              Ajustar stock <span className="text-muted-foreground">(actual: {product.stock})</span>
            </p>
            <div className="mb-2 grid grid-cols-3 gap-2">
              {AJUSTE_TIPOS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setAjusteTipo(t.value)}
                  className={cn(
                    "rounded-xl border py-2 text-sm font-medium transition-colors",
                    ajusteTipo === t.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal"
                placeholder={ajusteTipo === "ajuste" ? "Nuevo stock total" : "Cantidad"}
                value={ajusteCantidad} onChange={(e) => setAjusteCantidad(e.target.value)}
                className="rounded-xl"
              />
              <Button
                variant="outline" className="rounded-xl" disabled={ajustando || ajusteCantidad === ""}
                onClick={handleAjustar}
              >
                {ajustando ? "..." : "Aplicar"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button className="rounded-xl" disabled={saving || nombreInvalido} onClick={handleSave}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
