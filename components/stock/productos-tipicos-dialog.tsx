"use client";

// components/stock/productos-tipicos-dialog.tsx — productos tipicos del rubro del alta
// (lib/rubros-perfil.ts), ya configurados (kg, metro, sin control de stock, precio
// libre). El dueño tilda, pone precio y se crean como cualquier alta, marcados como
// productos rapidos del POS. Nada se crea sin precio: en $0 se venderia gratis.
// Diseño: docs/superpowers/specs/2026-10-18-perfil-por-rubro-design.md
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseCantidad } from "@/lib/cantidad";
import { perfilDeRubro, tipicosFaltantes, type ProductoTipico } from "@/lib/rubros-perfil";
import { RUBROS } from "@/lib/registro";
import { esFraccionable, simboloUnidad } from "@/lib/unidades";
import { getCurrentUser } from "@/hooks/use-auth";
import { createProduct, getCatalogoCompleto } from "@/services/products-service";

interface ProductosTipicosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreados: () => void;
}

interface Fila {
  tipico: ProductoTipico;
  elegido: boolean;
  precio: string;
  stock: string;
}

function detalle(t: ProductoTipico): string {
  const partes = [esFraccionable(t.unidad) ? `por ${simboloUnidad(t.unidad)}` : "por unidad"];
  if (t.precioLibre) partes.push("precio libre");
  else if (!t.stockControlado) partes.push("sin control de stock");
  return partes.join(" · ");
}

export function ProductosTipicosDialog({ open, onOpenChange, onCreados }: ProductosTipicosDialogProps) {
  const rubro = getCurrentUser()?.rubro;
  const nombreRubro = RUBROS.find((r) => r.id === rubro)?.nombre ?? "tu comercio";
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilas(null);
    const perfil = perfilDeRubro(rubro);
    getCatalogoCompleto()
      .then((cat) => cat.map((p) => p.name))
      .catch(() => [] as string[])
      .then((nombres) => setFilas(
        tipicosFaltantes(perfil, nombres).map((t) => ({ tipico: t, elegido: true, precio: "", stock: "" })),
      ));
  }, [open, rubro]);

  const cambiar = (i: number, parcial: Partial<Fila>) =>
    setFilas((prev) => prev && prev.map((f, j) => (j === i ? { ...f, ...parcial } : f)));

  // Se crean los tildados con precio (o de precio libre); el resto se avisa.
  const listos = useMemo(
    () => (filas ?? []).filter((f) => f.elegido && (f.tipico.precioLibre || (parseCantidad(f.precio) ?? 0) > 0)),
    [filas],
  );
  const sinPrecio = (filas ?? []).filter((f) => f.elegido && !f.tipico.precioLibre && !((parseCantidad(f.precio) ?? 0) > 0));

  const crear = async () => {
    if (listos.length === 0) return;
    setCreando(true);
    let creados = 0;
    try {
      for (const f of listos) {
        const t = f.tipico;
        await createProduct({
          name: t.name,
          price: t.precioLibre ? 0 : Math.round((parseCantidad(f.precio) ?? 0) * 100) / 100,
          stock: t.stockControlado ? parseCantidad(f.stock) ?? 0 : 0,
          category: t.category,
          codigo: t.codigo,
          unidad: t.unidad,
          stockControlado: t.stockControlado,
          precioLibre: !!t.precioLibre,
          favorito: true,
          revisar: false,
        });
        creados++;
      }
      toast.success(`${creados} producto${creados === 1 ? "" : "s"} creado${creados === 1 ? "" : "s"}`, {
        description: "Quedaron como productos rápidos en el punto de venta.",
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron crear los productos", {
        description: creados > 0 ? `Se crearon ${creados} antes del error.` : undefined,
      });
    } finally {
      setCreando(false);
      if (creados > 0) onCreados();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Productos típicos de {nombreRubro}
          </DialogTitle>
          <DialogDescription>
            Ya vienen configurados (por kg, por metro, sin control de stock...). Poneles tu precio y se crean
            como productos rápidos del punto de venta.
          </DialogDescription>
        </DialogHeader>

        {!filas ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ya tenés cargados todos los productos típicos.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {filas.map((f, i) => (
              <li key={f.tipico.name} className={cn("flex items-center gap-2 px-3 py-2", !f.elegido && "opacity-50")}>
                <input
                  type="checkbox" className="h-4 w-4 shrink-0 accent-primary"
                  checked={f.elegido} onChange={(e) => cambiar(i, { elegido: e.target.checked })}
                  aria-label={`Crear ${f.tipico.name}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.tipico.name}</p>
                  <p className="text-xs text-muted-foreground">{detalle(f.tipico)}</p>
                </div>
                {f.tipico.precioLibre ? (
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">Se pone al vender</span>
                ) : (
                  <>
                    {f.tipico.stockControlado && (
                      <Input
                        value={f.stock} onChange={(e) => cambiar(i, { stock: e.target.value })}
                        inputMode="decimal" placeholder={`Stock${esFraccionable(f.tipico.unidad) ? ` (${simboloUnidad(f.tipico.unidad)})` : ""}`}
                        className="h-8 w-20 shrink-0 rounded-lg text-right text-sm" disabled={!f.elegido}
                        aria-label={`Stock de ${f.tipico.name}`}
                      />
                    )}
                    <Input
                      value={f.precio} onChange={(e) => cambiar(i, { precio: e.target.value })}
                      inputMode="decimal" placeholder={esFraccionable(f.tipico.unidad) ? `$ por ${simboloUnidad(f.tipico.unidad)}` : "Precio $"}
                      className="h-8 w-24 shrink-0 rounded-lg text-right text-sm" disabled={!f.elegido}
                      aria-label={`Precio de ${f.tipico.name}`}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {sinPrecio.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {sinPrecio.length} tildado{sinPrecio.length === 1 ? "" : "s"} sin precio: no se crea{sinPrecio.length === 1 ? "" : "n"} hasta que le pongas uno.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={listos.length === 0 || creando} onClick={crear}>
            {creando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Crear {listos.length} producto{listos.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
