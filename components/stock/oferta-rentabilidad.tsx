"use client";
// components/stock/oferta-rentabilidad.tsx — el "simulador" del estudio de
// ofertas: cuanto ahorra el cliente, cuanto margen se resigna y cuantas
// unidades mas hay que vender para ganar lo mismo que sin oferta.
import { AlertTriangle, PiggyBank, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import type { AnalisisOferta } from "@/lib/oferta-analisis";

interface OfertaRentabilidadProps {
  analisis: AnalisisOferta;
  costo?: number;
  stock: number;
  stockControlado: boolean;
}

function BarraMargen({ pct, tono }: { pct: number; tono: "muted" | "money" | "danger" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tono === "muted" && "bg-muted-foreground/40",
          tono === "money" && "bg-money",
          tono === "danger" && "bg-destructive",
        )}
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function OfertaRentabilidad({ analisis: a, costo, stock, stockControlado }: OfertaRentabilidadProps) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PiggyBank className="h-4 w-4" /> El cliente ahorra
        </span>
        <span className="cifra text-lg font-bold text-money">
          {formatCurrency(a.ahorroTotal)}
          {a.ahorroPct > 0 && <span className="ml-1 text-xs font-semibold">({a.ahorroPct}%)</span>}
        </span>
      </div>

      {a.margenActualPct == null || a.margenOfertaPct == null ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Cargá el <b>costo</b> del producto (botón Editar) y acá vas a ver cuánto ganás con la oferta.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Margen sin oferta</span>
              <span className="cifra font-semibold">{a.margenActualPct}%</span>
            </div>
            <BarraMargen pct={a.margenActualPct} tono="muted" />
            <div className="flex justify-between pt-1 text-xs">
              <span className="text-muted-foreground">Margen con oferta</span>
              <span className={cn("cifra font-semibold", a.bajoCosto ? "text-destructive" : "text-money")}>
                {a.margenOfertaPct}%
              </span>
            </div>
            <BarraMargen pct={a.margenOfertaPct} tono={a.bajoCosto ? "danger" : "money"} />
          </div>

          {a.bajoCosto ? (
            <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Vendés por debajo del costo.</b> Perdés{" "}
                {formatCurrency(Math.abs(a.gananciaUnitaria ?? 0))} por unidad
                {costo != null && <> (costo {formatCurrency(costo)})</>}. Sirve para liquidar, no para ganar.
              </span>
            </div>
          ) : (
            <div className="flex gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Ganás <b className="cifra">{formatCurrency(a.gananciaUnitaria ?? 0)}</b> por unidad.
                {a.ventasExtraPct != null && a.ventasExtraPct > 0 && (
                  <> Para ganar lo mismo que hoy tenés que vender <b>{a.ventasExtraPct}% más</b> unidades.</>
                )}
              </span>
            </div>
          )}
        </>
      )}

      {stockControlado && (
        <p className="text-xs text-muted-foreground">
          {stock > 0 ? (
            <>
              Tenés <b className="cifra">{stock}</b> en stock: la oferta convierte hasta{" "}
              <b className="cifra">{formatCurrency(stock * a.precioUnitario)}</b> en caja.
            </>
          ) : (
            <span className="text-destructive">Sin stock: reponé antes de publicar la oferta.</span>
          )}
        </p>
      )}
    </div>
  );
}
