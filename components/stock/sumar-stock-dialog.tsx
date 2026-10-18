"use client";

// components/stock/sumar-stock-dialog.tsx — entrada de mercaderia con el lector en Stock.
// Se abre al escanear un producto que ya existe: cantidad (1 por defecto) y Enter suma.
// Si el lector escanea otra vez el mismo producto, suma 1 a la cantidad en vez de
// cargar 7790895000997 unidades (lib/escaneo-stock.ts); si es otro codigo, se pasa a ese.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Package, PackagePlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajustarStock } from "@/services/stock-service";
import { getCurrentUser } from "@/hooks/use-auth";
import { useCantidadConLector } from "@/hooks/use-cantidad-con-lector";
import { esCodigoDelProducto, leerEntradaCantidad } from "@/lib/escaneo-stock";
import { esFraccionable } from "@/lib/unidades";
import { cantidadTexto } from "@/lib/cantidad";
import type { Product } from "@/lib/types";

interface Props {
  producto: Product | null;
  onOpenChange: (open: boolean) => void;
  onSumado: () => void;
  /** El lector escaneo un codigo de otro producto con el dialogo abierto. */
  onOtroCodigo: (codigo: string) => void;
}

export function SumarStockDialog({ producto, onOpenChange, onSumado, onOtroCodigo }: Props) {
  const { valor: cantidad, cambiar, fijar, antes } = useCantidadConLector("1");
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!producto) return;
    fijar("1");
    setTimeout(() => inputRef.current?.select(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto]);

  if (!producto) return null;
  const porUnidad = !esFraccionable(producto.unidad);
  const unidadTexto = porUnidad ? "unidades" : producto.unidad;
  const esPack = !!producto.packDe;
  const sinControl = !producto.stockControlado;

  const leida = leerEntradaCantidad(cantidad, antes(), porUnidad);
  const stockNuevo = leida.tipo === "cantidad" ? producto.stock + leida.valor : null;

  const sumar = async () => {
    const entrada = leerEntradaCantidad(cantidad, antes(), porUnidad);
    if (entrada.tipo === "codigo") {
      if (esCodigoDelProducto(entrada.codigo, producto)) {
        // El mismo producto otra vez: una unidad mas.
        const siguiente = String(Number(antes().replace(",", ".")) + 1 || 1);
        fijar(siguiente);
      } else {
        onOtroCodigo(entrada.codigo);
      }
      return;
    }
    if (entrada.tipo === "invalida") {
      toast.error(porUnidad ? "Poné una cantidad entera mayor a cero" : "Poné una cantidad mayor a cero");
      fijar(antes());
      return;
    }
    if (esPack || sinControl) return;
    setGuardando(true);
    try {
      const res = await ajustarStock({
        productoId: producto.id, tipo: "entrada", cantidad: entrada.valor,
        usuario: getCurrentUser()?.nombre, referencia: "Carga con lector",
      });
      toast.success(`${producto.name}: +${cantidadTexto(entrada.valor, producto.unidad)} → stock ${cantidadTexto(res.stockNuevo, producto.unidad)}`);
      onSumado();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo sumar el stock");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!producto} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" /> Sumar stock</DialogTitle>
          <DialogDescription>Escribí cuántos entraron y Enter. Si volvés a pasar el mismo producto, suma uno más.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-3">
          {producto.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imageUrl} alt="" className="h-14 w-14 rounded-xl border bg-white object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border bg-card"><Package className="h-6 w-6 text-muted-foreground" /></div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{producto.name}</p>
            <p className="text-xs text-muted-foreground">{producto.codigoBarras || producto.codigo}</p>
          </div>
        </div>

        {esPack ? (
          <p className="rounded-xl bg-warning/15 px-3 py-2 text-sm">
            Es un pack: no tiene stock propio. Sumá la mercadería en el producto suelto.
          </p>
        ) : sinControl ? (
          <p className="rounded-xl bg-warning/15 px-3 py-2 text-sm">
            Este producto no controla stock. Activalo desde Editar si querés llevar la cuenta.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <label className="flex-1 space-y-1 text-sm">
                <span className="text-muted-foreground">Cantidad ({unidadTexto})</span>
                <Input
                  ref={inputRef}
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => cambiar(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void sumar(); }
                  }}
                  className="cifra h-12 rounded-xl text-center text-2xl"
                  autoFocus
                />
              </label>
              <div className="pb-1 text-right text-sm">
                <p className="text-xs text-muted-foreground">Stock</p>
                <p className="cifra font-semibold">
                  {cantidadTexto(producto.stock, producto.unidad)}
                  {stockNuevo !== null && <> → <span className="text-primary">{cantidadTexto(stockNuevo, producto.unidad)}</span></>}
                </p>
              </div>
            </div>
            <Button className="w-full rounded-xl" disabled={guardando || leida.tipo !== "cantidad"} onClick={() => void sumar()}>
              {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-2 h-4 w-4" />}
              Sumar al stock
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
