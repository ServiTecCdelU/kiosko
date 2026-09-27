"use client";
// components/stock/oferta-lote-dialog.tsx — la misma oferta a muchos productos
// de una ("-20% en toda la categoria hasta el domingo"). Avisa cuales quedarian
// por debajo del costo y por defecto los deja afuera.
import { useEffect, useMemo, useState } from "react";
import { Layers, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { analizarOferta, plantillasOferta } from "@/lib/oferta-analisis";
import { errorVigencia, estadoVigencia, hoyArgentinaISO } from "@/lib/oferta-vigencia";
import { OfertaVigenciaPicker } from "@/components/stock/oferta-vigencia-picker";
import { setOferta, type SetOfertaInput } from "@/services/products-service";
import type { Product } from "@/lib/types";

interface OfertaLoteDialogProps {
  productos: Product[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAplicado: () => void;
}

const PORCENTAJES = [10, 15, 20, 25, 30];
const COMBOS = ["2x1", "3x2", "2da50"];
const EN_PARALELO = 5;

type Opcion = { tipo: "pct"; valor: number } | { tipo: "combo"; id: string };

function ofertaPara(p: Product, opcion: Opcion): SetOfertaInput | null {
  if (opcion.tipo === "pct") return { activa: true, tipo: "porcentaje", valor: opcion.valor };
  if (p.unidad === "kg") return null; // los combos no aplican a productos por peso
  const plantilla = plantillasOferta(p.price).find((t) => t.id === opcion.id);
  return plantilla ? { activa: true, ...plantilla.oferta } : null;
}

export function OfertaLoteDialog({ productos, open, onOpenChange, onAplicado }: OfertaLoteDialogProps) {
  const [opcion, setOpcion] = useState<Opcion>({ tipo: "pct", valor: 20 });
  const [pctLibre, setPctLibre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [excluirBajoCosto, setExcluirBajoCosto] = useState(true);
  const [progreso, setProgreso] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setOpcion({ tipo: "pct", valor: 20 });
      setPctLibre("");
      setDesde("");
      setHasta("");
      setExcluirBajoCosto(true);
      setProgreso(null);
    }
  }, [open]);

  const plan = useMemo(() => {
    const aplicar: { p: Product; oferta: SetOfertaInput }[] = [];
    const bajoCosto: Product[] = [];
    const noAplica: Product[] = [];
    for (const p of productos) {
      const oferta = ofertaPara(p, opcion);
      if (!oferta) { noAplica.push(p); continue; }
      const a = analizarOferta({
        ...p, ofertaActiva: true, ofertaTipo: oferta.tipo, ofertaValor: oferta.valor ?? 0, ofertaCantidad: oferta.cantidad,
      });
      if (a.bajoCosto) {
        bajoCosto.push(p);
        if (excluirBajoCosto) continue;
      }
      aplicar.push({ p, oferta });
    }
    return { aplicar, bajoCosto, noAplica };
  }, [productos, opcion, excluirBajoCosto]);

  const errorFechas = errorVigencia(desde || null, hasta || null)
    ?? (estadoVigencia(desde || null, hasta || null) === "vencida" ? "Las fechas ya pasaron" : null);
  const pctInvalido = opcion.tipo === "pct" && (opcion.valor <= 0 || opcion.valor >= 100);
  const trabajando = progreso != null;

  const aplicar = async () => {
    const inicio = desde || hoyArgentinaISO();
    const cola = [...plan.aplicar];
    let hechos = 0;
    let fallidos = 0;
    setProgreso(0);
    while (cola.length > 0) {
      const tanda = cola.splice(0, EN_PARALELO);
      const res = await Promise.allSettled(
        tanda.map(({ p, oferta }) => setOferta(p.id, { ...oferta, desde: inicio, hasta: hasta || null })),
      );
      fallidos += res.filter((r) => r.status === "rejected").length;
      hechos += tanda.length;
      setProgreso(hechos);
    }
    const ok = plan.aplicar.length - fallidos;
    if (ok > 0) toast.success(`Oferta aplicada a ${ok} producto${ok > 1 ? "s" : ""}`);
    if (fallidos > 0) toast.error(`${fallidos} no se pudieron guardar`);
    setProgreso(null);
    onAplicado();
    onOpenChange(false);
  };

  const chip = (activo: boolean) => cn(
    "rounded-xl border px-3 py-2 text-sm font-bold transition-colors",
    activo ? "border-money bg-money/15 text-money" : "bg-card hover:border-money/60",
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !trabajando && onOpenChange(v)}>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-money" /> Oferta en lote
          </DialogTitle>
          <DialogDescription>
            La misma promo para {productos.length} producto{productos.length > 1 ? "s" : ""} seleccionado{productos.length > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Descuento</p>
            <div className="flex flex-wrap gap-2">
              {PORCENTAJES.map((v) => (
                <button key={v} className={chip(opcion.tipo === "pct" && opcion.valor === v && !pctLibre)}
                  onClick={() => { setOpcion({ tipo: "pct", valor: v }); setPctLibre(""); }}>
                  -{v}%
                </button>
              ))}
              <Input
                type="number" inputMode="decimal" placeholder="Otro %" value={pctLibre}
                onChange={(e) => { setPctLibre(e.target.value); setOpcion({ tipo: "pct", valor: Number(e.target.value) || 0 }); }}
                className="h-10 w-24 rounded-xl"
              />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">O un combo (según el precio de cada uno)</p>
            <div className="flex flex-wrap gap-2">
              {COMBOS.map((id) => (
                <button key={id} className={chip(opcion.tipo === "combo" && opcion.id === id)}
                  onClick={() => { setOpcion({ tipo: "combo", id }); setPctLibre(""); }}>
                  {plantillasOferta(1).find((t) => t.id === id)?.label}
                </button>
              ))}
            </div>
          </div>

          <OfertaVigenciaPicker desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} />
          {errorFechas && <p className="text-xs text-destructive">{errorFechas}</p>}

          {plan.bajoCosto.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> {plan.bajoCosto.length} quedarían por debajo del costo
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {plan.bajoCosto.slice(0, 4).map((p) => p.name).join(", ")}{plan.bajoCosto.length > 4 && ` y ${plan.bajoCosto.length - 4} más`}
              </p>
              <label className="mt-1.5 flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={excluirBajoCosto} onChange={(e) => setExcluirBajoCosto(e.target.checked)} />
                Dejarlos afuera
              </label>
            </div>
          )}
          {plan.noAplica.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {plan.noAplica.length} por peso quedan afuera: los combos no aplican a productos por kg.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" disabled={trabajando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl"
            disabled={trabajando || plan.aplicar.length === 0 || !!errorFechas || pctInvalido}
            onClick={aplicar}
          >
            {trabajando ? `Aplicando ${progreso}/${plan.aplicar.length}...` : `Aplicar a ${plan.aplicar.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
