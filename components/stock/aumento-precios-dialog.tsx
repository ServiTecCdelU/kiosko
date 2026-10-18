"use client";

// components/stock/aumento-precios-dialog.tsx — "todo Almacén +12%": aumento o rebaja
// de precios por % para el catalogo o un rubro, con vista previa antes de aplicar.
// La vista previa usa lib/aumento-precios.ts; la cuenta real la hace el servidor
// con la misma formula (65_aumento_precios.sql).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { parseCantidad } from "@/lib/cantidad";
import {
  REDONDEOS, alcanzaAumento, errorPorcentaje, nuevoPrecio, rubrosPrincipales,
} from "@/lib/aumento-precios";
import { aumentarPrecios, getCatalogoCompleto } from "@/services/products-service";
import type { Product } from "@/lib/types";

interface AumentoPreciosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAplicado: () => void;
}

const SELECT_CLASS = "h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm";

/** "-10" o "12,5" -> numero (admite signo, a diferencia de parseCantidad). */
function parsePorcentaje(texto: string): number {
  const t = texto.trim();
  const negativo = t.startsWith("-");
  const n = parseCantidad(negativo ? t.slice(1) : t);
  return n === null ? NaN : negativo ? -n : n;
}

export function AumentoPreciosDialog({ open, onOpenChange, onAplicado }: AumentoPreciosDialogProps) {
  const [catalogo, setCatalogo] = useState<Product[] | null>(null);
  const [rubro, setRubro] = useState("");
  const [texto, setTexto] = useState("");
  const [redondeo, setRedondeo] = useState<number>(0);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTexto("");
    setRubro("");
    setRedondeo(0);
    setCatalogo(null);
    getCatalogoCompleto()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, [open]);

  const rubros = useMemo(() => rubrosPrincipales((catalogo ?? []).map((p) => p.category)), [catalogo]);
  const pct = parsePorcentaje(texto);
  const error = texto.trim() ? errorPorcentaje(pct) : null;
  const afectados = useMemo(
    () => (catalogo ?? []).filter((p) => alcanzaAumento(p, rubro || null)),
    [catalogo, rubro],
  );
  const ejemplos = !error && texto.trim() ? afectados.slice(0, 4) : [];
  const puedeAplicar = !!texto.trim() && !error && afectados.length > 0 && !aplicando;

  const aplicar = async () => {
    if (!puedeAplicar) return;
    setAplicando(true);
    try {
      const n = await aumentarPrecios({ porcentaje: pct, rubro: rubro || null, redondeo });
      toast.success(`${n} precio${n === 1 ? "" : "s"} actualizado${n === 1 ? "" : "s"}`);
      onOpenChange(false);
      onAplicado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron actualizar los precios");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Aumentar precios
          </DialogTitle>
          <DialogDescription>
            Sube (o baja, con un % negativo) el precio de todo el catálogo o de un rubro. Queda registrado en el historial de precios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Rubro</Label>
            <select value={rubro} onChange={(e) => setRubro(e.target.value)} className={SELECT_CLASS} disabled={!catalogo}>
              <option value="">Todo el catálogo</option>
              {rubros.map((r) => <option key={r} value={r}>{r} (y sus subrubros)</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Porcentaje</Label>
            <div className="relative">
              <Input
                type="text" inputMode="decimal" autoFocus placeholder="Ej: 12 (o -10 para bajar)"
                value={texto} onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aplicar()}
                className="rounded-xl pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div>
            <Label className="mb-1 block text-xs">Redondear hacia arriba</Label>
            <div className="flex rounded-xl border p-0.5">
              {REDONDEOS.map((r) => (
                <button
                  key={r} type="button" onClick={() => setRedondeo(r)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
                    redondeo === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r === 0 ? "No" : `a $${r}`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-muted/50 p-3 text-sm">
            {!catalogo ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo…</p>
            ) : (
              <>
                <p>
                  Se actualizan <b>{afectados.length}</b> producto{afectados.length === 1 ? "" : "s"}.
                  <span className="block text-xs text-muted-foreground">
                    No se tocan los de precio libre, los que no tienen precio ni los desactivados.
                  </span>
                </p>
                {ejemplos.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {ejemplos.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="truncate">{p.name}</span>
                        <span className="cifra shrink-0">
                          {formatCurrency(p.price)} → <b>{formatCurrency(nuevoPrecio(p.price, pct, redondeo))}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={!puedeAplicar} onClick={aplicar}>
            {aplicando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar a {afectados.length} producto{afectados.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
