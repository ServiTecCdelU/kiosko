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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ALICUOTAS_IVA, IVA_DEFAULT } from "@/lib/iva";
import { lookupNombrePorCodigoBarras } from "@/lib/barcode-lookup";
import { createProduct, findProductByCode, type CreateProductInput } from "@/services/products-service";
import { UNIDADES, esFraccionable, simboloUnidad, type Unidad } from "@/lib/unidades";
import { perfilDeRubro } from "@/lib/rubros-perfil";
import { getCurrentUser } from "@/hooks/use-auth";

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
  // El rubro del alta sugiere la unidad (pan y verdura por kg) y los rubros habituales.
  const perfil = perfilDeRubro(getCurrentUser()?.rubro);
  const [unidad, setUnidad] = useState<Unidad>(perfil.unidad);
  // kg, m y l: precio y stock por esa unidad, con decimales y sin "unidades por bulto".
  const porKg = esFraccionable(unidad);
  const simbolo = simboloUnidad(unidad);
  const [stockControlado, setStockControlado] = useState(perfil.controlaStock);
  const [precioLibre, setPrecioLibre] = useState(false);
  const [elaboracionPropia, setElaboracionPropia] = useState(false);
  const [iva, setIva] = useState(IVA_DEFAULT);
  const [saving, setSaving] = useState(false);
  // El aviso del nombre recien despues de tocarlo: no se reta antes de escribir.
  const [nombreTocado, setNombreTocado] = useState(false);
  // Al escanear o escribir el codigo de barra: si ya existe se avisa; si no, se
  // busca el nombre en las bases publicas (igual que el alta rapida del POS).
  const [yaExiste, setYaExiste] = useState<string | null>(null);
  const [buscandoNombre, setBuscandoNombre] = useState(false);
  const [codigoBuscado, setCodigoBuscado] = useState("");

  useEffect(() => {
    if (!open) return;
    setNombreTocado(false);
    setYaExiste(null);
    setBuscandoNombre(false);
    setCodigoBuscado("");
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
    setUnidad(perfil.unidad);
    setStockControlado(perfil.controlaStock);
    setPrecioLibre(false);
    setElaboracionPropia(false);
    setIva(IVA_DEFAULT);
  }, [open]);

  const priceNum = Number(price) || 0;
  const costoNum = costo ? Number(costo) || 0 : undefined;
  const margenPct = costoNum && priceNum > 0 ? ((priceNum - costoNum) / priceNum) * 100 : undefined;
  const nombreInvalido = !name.trim();

  const buscarCodigo = async () => {
    const c = codigoBarras.trim();
    if (!c || c === codigoBuscado) return;
    setCodigoBuscado(c);
    setYaExiste(null);
    const existente = await findProductByCode(c).catch(() => null);
    if (existente) {
      setYaExiste(existente.name);
      return;
    }
    if (name.trim()) return;
    setBuscandoNombre(true);
    const sugerido = await lookupNombrePorCodigoBarras(c).finally(() => setBuscandoNombre(false));
    // Si mientras tanto escribio un nombre, no se le pisa.
    if (sugerido) setName((n) => n.trim() ? n : sugerido);
  };

  const handleGuardar = async () => {
    if (nombreInvalido) return;
    setSaving(true);
    try {
      const input: CreateProductInput = {
        name: name.trim(),
        price: priceNum,
        stock: stockControlado ? Number(stock) || 0 : 0,
        codigo: codigo.trim() || undefined,
        codigoBarras: codigoBarras.trim() || undefined,
        category: category.trim() || undefined,
        costo: costoNum,
        stockMinimo: Number(stockMinimo) || 0,
        lote: lote && !porKg ? Number(lote) : undefined,
        unidad,
        fechaVencimiento: fechaVencimiento || undefined,
        favorito,
        stockControlado,
        precioLibre,
        elaboracionPropia,
        iva,
        // Cargado a mano con todos sus datos no hay nada que revisar; sin precio, si
        // (salvo precio libre: el importe se pone al vender).
        revisar: priceNum <= 0 && !precioLibre,
      };
      await createProduct(input);
      toast.success(`${input.name} guardado`);
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setSaving(false);
    }
  };

  const selectClass = "border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

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
              <Input
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                onBlur={buscarCodigo}
                // El lector manda Enter al final del codigo.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscarCodigo();
                  }
                }}
                placeholder="Escaneá o escribí"
                className="rounded-xl"
                autoFocus
              />
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
              onBlur={() => setNombreTocado(true)}
              placeholder="Nombre del producto"
              className="rounded-xl"
            />
            {yaExiste && (
              <p className="mt-1 text-xs text-warning">Ya tenés un producto con ese código: “{yaExiste}”. Buscalo en la lista para editarlo.</p>
            )}
            {buscandoNombre && <p className="mt-1 text-xs text-muted-foreground">Buscando el nombre por el código…</p>}
            {nombreInvalido && nombreTocado && <p className="mt-1 text-xs text-destructive">El nombre es obligatorio</p>}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Rubro / Subrubro</Label>
            <Input
              value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder={`Ej: ${perfil.categorias[0] ?? "Almacén / Galletitas"}`} className="rounded-xl"
              list="rubros-sugeridos"
            />
            <datalist id="rubros-sugeridos">
              {perfil.categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Va antes que precio y stock: los rotulos cambian si se vende por kg, metro o litro. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Se vende por</Label>
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)} className={selectClass}>
                {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Fecha de vencimiento</Label>
              <Input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="mb-1 block text-xs">{porKg ? `Precio por ${simbolo}` : "Precio de venta"}</Label>
              <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">{porKg ? `Costo por ${simbolo}` : "Costo"}</Label>
              <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Opcional" className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">IVA</Label>
              <select value={iva} onChange={(e) => setIva(Number(e.target.value))} className={selectClass} aria-label="Alícuota de IVA">
                {ALICUOTAS_IVA.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          {!price && nombreTocado && (
            <p className="-mt-2 text-xs text-muted-foreground">Sin precio queda marcado “A revisar” hasta que se lo pongas.</p>
          )}

          {margenPct !== undefined && (
            <div className={cn(
              "rounded-xl px-3 py-2 text-sm",
              margenPct < 0 ? "bg-destructive/10 text-destructive" : "bg-money/10 text-money",
            )}>
              Margen: <strong>{margenPct.toFixed(1)}%</strong>
              {margenPct < 0 && " — estás vendiendo por debajo del costo"}
            </div>
          )}

          {stockControlado && (
            <div className={cn("grid gap-2", porKg ? "grid-cols-2" : "grid-cols-3")}>
              <div>
                <Label className="mb-1 block text-xs">{porKg ? `Stock inicial (${simbolo})` : "Stock inicial"}</Label>
                <Input
                  type="number" inputMode={porKg ? "decimal" : "numeric"} step={porKg ? "0.001" : "1"}
                  value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" className="rounded-xl"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">{porKg ? `Stock mínimo (${simbolo})` : "Stock mínimo"}</Label>
                <Input
                  type="number" inputMode={porKg ? "decimal" : "numeric"} step={porKg ? "0.001" : "1"}
                  value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} className="rounded-xl"
                />
              </div>
              {!porKg && (
                <div>
                  <Label className="mb-1 block text-xs">Unidades por bulto</Label>
                  <Input type="number" inputMode="numeric" value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Ej: 12" className="rounded-xl" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Producto rápido (grilla del POS)</span>
              <Switch checked={favorito} onCheckedChange={setFavorito} />
            </label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">
                No controlar stock
                <span className="block text-xs font-normal text-muted-foreground">
                  Se vende sin contar unidades. Ej: recargas, fotocopias, o el pan y la verdura si no los contás
                </span>
              </span>
              <Switch
                checked={!stockControlado}
                // Sin control de stock no hay produccion que medir.
                onCheckedChange={(v) => { setStockControlado(!v); if (v) setElaboracionPropia(false); }}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">
                Precio libre
                <span className="block text-xs font-normal text-muted-foreground">
                  Al venderlo se tipea el importe. Ej: recarga SUBE o de celular, varios
                </span>
              </span>
              <Switch checked={precioLibre} onCheckedChange={setPrecioLibre} />
            </label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">
                Lo elaboramos acá
                <span className="block text-xs font-normal text-muted-foreground">
                  Aparece en Producción para cargar lo horneado cada día. Lleva control de stock
                </span>
              </span>
              <Switch
                checked={elaboracionPropia}
                onCheckedChange={(v) => { setElaboracionPropia(v); if (v) setStockControlado(true); }}
              />
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
