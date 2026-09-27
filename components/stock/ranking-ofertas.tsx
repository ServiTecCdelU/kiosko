"use client";
// components/stock/ranking-ofertas.tsx — "¿Que promos te funcionan?": con las
// ofertas ya terminadas (ofertas_historial) muestra que tipo de promo sube mas
// las ventas en ESTE negocio, y las ultimas ofertas con su resultado.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { rankingPromos, textoPromoHistorial } from "@/lib/oferta-historial";
import { getHistorialOfertas, type OfertaTerminada } from "@/services/products-service";

const ULTIMAS = 8;

function fechaCorta(iso?: string): string {
  if (!iso) return "?";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${Number(m)}`;
}

function Variacion({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">sin medir</span>;
  return (
    <span className={cn("cifra text-xs font-semibold", pct > 0 ? "text-money" : pct < 0 ? "text-destructive" : "text-muted-foreground")}>
      {pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}

export function RankingOfertas({ version }: { version: number }) {
  const [registros, setRegistros] = useState<OfertaTerminada[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setRegistros(await getHistorialOfertas());
    } catch {
      setRegistros([]); // es un extra: si falla, no se muestra
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, version]);

  if (registros.length === 0) return null;

  const ranking = rankingPromos(registros);
  const mejor = ranking[0];
  const escala = Math.max(1, ...ranking.map((r) => Math.abs(r.variacionPromedio)));

  return (
    <div className="card-premium mb-4 rounded-2xl p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold">¿Qué promos te funcionan?</p>
            <p className="text-xs text-muted-foreground">
              {mejor && mejor.variacionPromedio > 0
                ? <>Lo que más vende en tu negocio: <b className="text-foreground">{mejor.familia}</b> (+{mejor.variacionPromedio}%)</>
                : `${registros.length} oferta${registros.length > 1 ? "s" : ""} terminada${registros.length > 1 ? "s" : ""} · todavía sin datos para comparar`}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <div className="mt-4 grid gap-5 border-t border-border/60 pt-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Promedio de ventas extra por tipo de promo</p>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Las ofertas se miden desde el 2do día; cuando terminen algunas más vas a ver la comparación acá.</p>
            ) : (
              <ul className="space-y-2.5">
                {ranking.map((r) => (
                  <li key={r.familia}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{r.familia}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <Variacion pct={r.variacionPromedio} /> · {r.cantidad} oferta{r.cantidad > 1 ? "s" : ""} · {formatCurrency(r.facturado)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", r.variacionPromedio >= 0 ? "bg-money" : "bg-destructive")}
                        style={{ width: `${Math.max(3, (Math.abs(r.variacionPromedio) / escala) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Últimas ofertas terminadas</p>
            <ul className="divide-y divide-border/60">
              {registros.slice(0, ULTIMAS).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.productoNombre}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {textoPromoHistorial(r)} · {fechaCorta(r.desde)} al {fechaCorta(r.hasta)}
                    </span>
                  </span>
                  <Variacion pct={r.variacionPct} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
