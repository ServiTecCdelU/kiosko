"use client";
// components/stock/ofertas-recomendadas.tsx — "que conviene ofertar": productos
// con stock quieto o margen de sobra, con la promo sugerida lista para crear.
// Se puede descartar una sugerencia por 14 dias (se recuerda en este navegador).
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Lightbulb, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { getOfertasSugeridas, type OfertaSugerida } from "@/services/products-service";
import type { SugerenciaOferta } from "@/lib/oferta-sugerencias";
import type { Product } from "@/lib/types";

interface OfertasRecomendadasProps {
  /** Cambia cuando se guarda una oferta, para sacar de la lista lo que ya se oferto. */
  version: number;
  onCrear: (producto: Product, plantillaId: string) => void;
}

const DESCARTADAS_KEY = "kiosko:ofertas-descartadas";
const DIAS_DESCARTE = 14;

function leerDescartadas(): Record<string, number> {
  try {
    const crudo = JSON.parse(localStorage.getItem(DESCARTADAS_KEY) ?? "{}") as Record<string, number>;
    const limite = Date.now() - DIAS_DESCARTE * 86_400_000;
    return Object.fromEntries(Object.entries(crudo).filter(([, t]) => t > limite));
  } catch {
    return {};
  }
}

function motivoTexto(s: SugerenciaOferta): string {
  const ritmo = s.porDia.toLocaleString("es-AR");
  if (s.motivo === "sin-ventas") return "No se vendió en el último mes";
  if (s.motivo === "estancado") return `Stock para ${s.diasDeStock} días · vende ${ritmo}/día`;
  return `Margen alto y rota poco (${ritmo}/día)`;
}

export function OfertasRecomendadas({ version, onCrear }: OfertasRecomendadasProps) {
  const [items, setItems] = useState<OfertaSugerida[]>([]);
  const [descartadas, setDescartadas] = useState<Record<string, number>>({});
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setItems(await getOfertasSugeridas());
    } catch {
      setItems([]); // es un extra: si falla, no se muestra
    }
  }, []);

  useEffect(() => { setDescartadas(leerDescartadas()); }, []);
  useEffect(() => { cargar(); }, [cargar, version]);

  const visibles = items.filter((i) => !descartadas[i.producto.id]);
  if (visibles.length === 0) return null;

  const capital = visibles.reduce((s, i) => s + i.sugerencia.capital, 0);

  const descartar = (id: string) => {
    const next = { ...descartadas, [id]: Date.now() };
    setDescartadas(next);
    try {
      localStorage.setItem(DESCARTADAS_KEY, JSON.stringify(next));
    } catch {
      // sin storage: se descarta solo por esta visita
    }
  };

  return (
    <div className="card-premium mb-4 rounded-2xl p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Lightbulb className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold">Ofertas recomendadas</p>
            <p className="text-xs text-muted-foreground">
              {visibles.length} producto{visibles.length > 1 ? "s" : ""} para mover ·{" "}
              <span className="cifra font-medium text-foreground">{formatCurrency(capital)}</span> de mercadería quieta
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
          {visibles.map(({ producto: p, sugerencia: s }) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {motivoTexto(s)} · {p.stock} en stock ({formatCurrency(s.capital)})
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-right leading-tight">
                  <span className="block rounded-lg bg-[#ffd400] px-2 py-0.5 text-xs font-black text-[#d7141a]">{s.plantilla.label}</span>
                  {s.margenOfertaPct != null && (
                    <span className="text-[10px] text-muted-foreground">margen {s.margenOfertaPct}%</span>
                  )}
                </span>
                <Button size="sm" className="rounded-xl" onClick={() => onCrear(p, s.plantilla.id)}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> Crear
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 rounded-xl text-muted-foreground"
                  title={`No sugerir por ${DIAS_DESCARTE} días`} onClick={() => descartar(p.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
