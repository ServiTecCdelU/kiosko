"use client";

// components/stock/editar-producto-dialog.tsx — datos del producto, ajuste de
// stock con mermas por motivo, lotes de vencimiento e historial de precios.
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type { Product } from "@/lib/types";
import { getHistorialPrecio, type UpdateProductInput, type CambioPrecio } from "@/services/products-service";
import { crearLote, darDeBajaLote, getLotes, type LoteProducto } from "@/services/lotes-service";
import { aDiaIso, diasHastaVencimiento, fechaDeDia, textoVencimiento } from "@/lib/oferta-vencimiento";
import { ALICUOTAS_IVA, IVA_DEFAULT } from "@/lib/iva";
import { MOTIVOS_MERMA, type MotivoMerma } from "@/lib/perdidas";

type AjusteTipo = "entrada" | "ajuste" | "rotura";

interface EditarProductoDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UpdateProductInput) => Promise<void>;
  onAjustarStock: (tipo: AjusteTipo, cantidad: number, motivo?: MotivoMerma, nota?: string) => Promise<void>;
}

const AJUSTE_TIPOS: { value: AjusteTipo; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "ajuste", label: "Ajuste" },
  { value: "rotura", label: "Merma" },
];

const SELECT_CLASS = "border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

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
  const [favorito, setFavorito] = useState(false);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [unidad, setUnidad] = useState<"un" | "kg">("un");
  const [stockControlado, setStockControlado] = useState(true);
  const [iva, setIva] = useState(IVA_DEFAULT);
  const [historial, setHistorial] = useState<CambioPrecio[]>([]);
  const [saving, setSaving] = useState(false);

  const [ajusteTipo, setAjusteTipo] = useState<AjusteTipo>("entrada");
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [mermaMotivo, setMermaMotivo] = useState<MotivoMerma>("rotura");
  const [mermaNota, setMermaNota] = useState("");
  const [ajustando, setAjustando] = useState(false);

  const [lotes, setLotes] = useState<LoteProducto[] | null>(null);
  const [loteFecha, setLoteFecha] = useState("");
  const [loteCantidad, setLoteCantidad] = useState("");
  const [loteGuardando, setLoteGuardando] = useState(false);

  const cargarLotes = useCallback((id: string) => {
    getLotes(id).then(setLotes).catch(() => setLotes([]));
  }, []);

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
      setFavorito(product.favorito);
      setFechaVencimiento(product.fechaVencimiento ? aDiaIso(product.fechaVencimiento) : "");
      setUnidad(product.unidad);
      setStockControlado(product.stockControlado);
      setIva(product.iva ?? IVA_DEFAULT);
      getHistorialPrecio(product.id).then(setHistorial).catch(() => setHistorial([]));
      setAjusteTipo("entrada");
      setAjusteCantidad("");
      setMermaMotivo("rotura");
      setMermaNota("");
      setLotes(null);
      setLoteFecha("");
      setLoteCantidad("");
      cargarLotes(product.id);
    }
  }, [open, product, cargarLotes]);

  if (!product) return null;

  const priceNum = Number(price) || 0;
  const costoNum = costo ? Number(costo) || 0 : undefined;
  const margenPct = costoNum && priceNum > 0 ? ((priceNum - costoNum) / priceNum) * 100 : undefined;
  const stockMinimoNum = Number(stockMinimo) || 0;
  const loteNum = lote ? Number(lote) : undefined;
  const nombreInvalido = !name.trim();
  const tieneLotes = (lotes?.length ?? 0) > 0;

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
        favorito,
        // Con lotes, la fecha la manda el lote mas proximo: no se pisa a mano.
        fechaVencimiento: tieneLotes ? (product.fechaVencimiento ? aDiaIso(product.fechaVencimiento) : undefined) : fechaVencimiento || undefined,
        unidad,
        stockControlado,
        iva,
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
      await onAjustarStock(ajusteTipo, n, ajusteTipo === "rotura" ? mermaMotivo : undefined, ajusteTipo === "rotura" ? mermaNota.trim() || undefined : undefined);
      setAjusteCantidad("");
      setMermaNota("");
    } finally {
      setAjustando(false);
    }
  };

  const handleCrearLote = async () => {
    if (!loteFecha) return;
    setLoteGuardando(true);
    try {
      await crearLote({ productoId: product.id, fechaVencimiento: loteFecha, cantidad: Number(loteCantidad) || 0 });
      toast.success("Lote cargado");
      setLoteFecha("");
      setLoteCantidad("");
      cargarLotes(product.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el lote");
    } finally {
      setLoteGuardando(false);
    }
  };

  const handleBajaLote = async (l: LoteProducto) => {
    try {
      await darDeBajaLote(l.id);
      toast.success("Lote dado de baja. Si tiraste mercadería, registrala como merma.");
      cargarLotes(product.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo dar de baja el lote");
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

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="mb-1 block text-xs">Precio de venta</Label>
              <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Costo</Label>
              <Input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Opcional" className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">IVA</Label>
              <select value={iva} onChange={(e) => setIva(Number(e.target.value))} className={SELECT_CLASS} aria-label="Alícuota de IVA">
                {ALICUOTAS_IVA.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
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
              <Label className="mb-1 block text-xs">Stock mínimo</Label>
              <Input type="number" inputMode="numeric" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Unidades por bulto</Label>
              <Input type="number" inputMode="numeric" value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Ej: 12" className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Se vende por</Label>
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as "un" | "kg")} className={SELECT_CLASS}>
                <option value="un">Unidad</option>
                <option value="kg">Peso (kg)</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="h-4 w-4 text-warning" /> Vencimientos
            </p>
            {tieneLotes ? (
              <ul className="mb-2 divide-y rounded-lg border text-sm">
                {lotes!.map((l) => {
                  const d = fechaDeDia(l.fechaVencimiento);
                  const dias = d ? diasHastaVencimiento(d) : null;
                  const texto = dias != null ? textoVencimiento(dias) : null;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <span>
                        <b className={cn(dias != null && dias <= 7 && "text-warning", dias != null && dias < 0 && "text-destructive")}>
                          {l.fechaVencimiento.split("-").reverse().join("/")}
                        </b>
                        {l.cantidad > 0 && <span className="text-muted-foreground"> · {l.cantidad} u.</span>}
                        {texto && <span className="text-xs text-muted-foreground"> · {texto}</span>}
                        {l.compraId && <span className="text-xs text-muted-foreground"> · de compra</span>}
                      </span>
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg text-muted-foreground" onClick={() => handleBajaLote(l)} title="Se terminó o se tiró este lote">
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Baja
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mb-2">
                <Label className="mb-1 block text-xs">Fecha de vencimiento</Label>
                <Input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="rounded-xl" />
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="mb-1 block text-xs">{tieneLotes ? "Otro lote" : "Cargar por lote"}</Label>
                <Input type="date" value={loteFecha} onChange={(e) => setLoteFecha(e.target.value)} className="h-9 rounded-xl" />
              </div>
              <div className="w-24">
                <Label className="mb-1 block text-xs">Cantidad</Label>
                <Input type="number" inputMode="decimal" value={loteCantidad} onChange={(e) => setLoteCantidad(e.target.value)} placeholder="Opc." className="h-9 rounded-xl" />
              </div>
              <Button variant="outline" className="h-9 rounded-xl" disabled={!loteFecha || loteGuardando} onClick={handleCrearLote}>
                {loteGuardando ? "..." : "Agregar"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Con lotes, el aviso de vencimiento usa el más próximo. Los lotes también se cargan al recibir una compra.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Deshabilitado</span>
              <Switch checked={disabled} onCheckedChange={setDisabled} />
            </label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">A revisar</span>
              <Switch checked={revisar} onCheckedChange={setRevisar} />
            </label>
            <label className="col-span-2 flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Producto rápido (grilla del POS)</span>
              <Switch checked={favorito} onCheckedChange={setFavorito} />
            </label>
            <label className="col-span-2 flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">
                Es un servicio (sin stock)
                <span className="block text-xs font-normal text-muted-foreground">
                  Ej: recarga de celular, fotocopias — se cobra pero no descuenta stock
                </span>
              </span>
              <Switch checked={!stockControlado} onCheckedChange={(v) => setStockControlado(!v)} />
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
            {ajusteTipo === "rotura" && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                <select value={mermaMotivo} onChange={(e) => setMermaMotivo(e.target.value as MotivoMerma)} className={SELECT_CLASS} aria-label="Motivo de la merma">
                  {MOTIVOS_MERMA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <Input value={mermaNota} onChange={(e) => setMermaNota(e.target.value)} placeholder="Nota (opcional)" className="h-9 rounded-xl" maxLength={120} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal"
                placeholder={ajusteTipo === "ajuste" ? "Nuevo stock total" : ajusteTipo === "rotura" ? "Cantidad perdida" : "Cantidad"}
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
            {ajusteTipo === "rotura" && (
              <p className="mt-1 text-xs text-muted-foreground">Las mermas se valorizan a costo y aparecen como pérdida en Reportes.</p>
            )}
          </div>

          {historial.length > 0 && (
            <div className="rounded-xl border p-3">
              <p className="mb-2 text-sm font-medium">Historial de cambios de precio</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {historial.map((h) => (
                  <li key={h.id} className="flex items-center justify-between">
                    <span>
                      {formatCurrency(Number(h.valorAnterior))} → <strong className="text-foreground">{formatCurrency(Number(h.valorNuevo))}</strong>
                      {h.usuarioNombre && ` · ${h.usuarioNombre}`}
                    </span>
                    <span>{formatDateTime(h.fecha)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
