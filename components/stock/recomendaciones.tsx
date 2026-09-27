"use client";
// components/stock/recomendaciones.tsx — una sola tarjeta con todo lo que conviene
// hacer hoy con la mercadería: ofertar lo que vence, mover lo que está quieto y
// reponer lo que se acaba. Cada recomendación trae su acción lista.
// Las sugerencias de oferta se pueden descartar por 14 días (se recuerda en este navegador).
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Lightbulb, PackagePlus, Sparkles, X, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { getOfertasSugeridas, type OfertaSugerida, type ReposicionItem } from "@/services/products-service";
import { diasHastaVencimiento, sugerirDescuentoVencimiento } from "@/lib/oferta-vencimiento";
import { tieneOferta } from "@/lib/pricing";
import type { SugerenciaOferta } from "@/lib/oferta-sugerencias";
import type { Product } from "@/lib/types";

interface RecomendacionesProps {
  vencimientos: Product[];
  reposicion: ReposicionItem[];
  /** Cambia cuando se guarda una oferta, para sacar de la lista lo que ya se ofertó. */
  version: number;
  onCrear: (producto: Product, plantillaId: string) => void;
  onAplicarVencimiento: (producto: Product, descuento: number) => Promise<void>;
}

const DESCARTADAS_KEY = "kiosko:ofertas-descartadas";
const DIAS_DESCARTE = 14;
const DIAS_REPOSICION_URGENTE = 5;

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

function textoVence(dias: number): string {
  if (dias < 0) return "Ya venció";
  if (dias === 0) return "Vence hoy";
  return dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
}

function Seccion({ icono: Icono, titulo, cantidad, tono, children }: {
  icono: typeof Lightbulb; titulo: string; cantidad: number; tono: string; children: React.ReactNode;
}) {
  return (
    <section className="pt-3 first:pt-0">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icono className={cn("h-3.5 w-3.5", tono)} /> {titulo}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-foreground">{cantidad}</span>
      </h3>
      <ul className="divide-y divide-border/60">{children}</ul>
    </section>
  );
}

export function Recomendaciones({ vencimientos, reposicion, version, onCrear, onAplicarVencimiento }: RecomendacionesProps) {
  const [sugeridas, setSugeridas] = useState<OfertaSugerida[]>([]);
  const [descartadas, setDescartadas] = useState<Record<string, number>>({});
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setSugeridas(await getOfertasSugeridas());
    } catch {
      setSugeridas([]); // es un extra: si falla, no se muestra
    }
  }, []);

  useEffect(() => { setDescartadas(leerDescartadas()); }, []);
  useEffect(() => { cargar(); }, [cargar, version]);

  const quietas = sugeridas.filter((i) => !descartadas[i.producto.id]);
  const porVencer = useMemo(
    () => vencimientos
      .map((p) => ({ p, dias: p.fechaVencimiento ? diasHastaVencimiento(p.fechaVencimiento) : null }))
      .filter((v): v is { p: Product; dias: number } => v.dias != null)
      .sort((a, b) => a.dias - b.dias),
    [vencimientos],
  );
  const aReponer = useMemo(
    () => reposicion
      .filter((r): r is ReposicionItem & { diasRestantes: number } => r.diasRestantes != null && r.diasRestantes <= DIAS_REPOSICION_URGENTE)
      .sort((a, b) => a.diasRestantes - b.diasRestantes),
    [reposicion],
  );

  const total = quietas.length + porVencer.length + aReponer.length;
  if (total === 0) return null;

  const capitalQuieto = quietas.reduce((s, i) => s + i.sugerencia.capital, 0);
  const resumen = [
    porVencer.length > 0 && `${porVencer.length} por vencer`,
    quietas.length > 0 && `${quietas.length} quieto${quietas.length > 1 ? "s" : ""} (${formatCurrency(capitalQuieto)})`,
    aReponer.length > 0 && `${aReponer.length} por agotarse`,
  ].filter(Boolean).join(" · ");

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
            <p className="font-semibold">Recomendaciones <span className="text-muted-foreground">({total})</span></p>
            <p className="text-xs text-muted-foreground">{resumen}</p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <div className="mt-4 space-y-1 border-t border-border/60 pt-3">
          {porVencer.length > 0 && (
            <Seccion icono={CalendarClock} titulo="Vencen pronto" cantidad={porVencer.length} tono="text-warning">
              {porVencer.map(({ p, dias }) => {
                const pct = sugerirDescuentoVencimiento(dias);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{textoVence(dias)} · {p.stock} en stock</p>
                    </div>
                    {tieneOferta(p) ? (
                      <span className="shrink-0 text-xs text-muted-foreground">ya tiene oferta</span>
                    ) : pct != null ? (
                      <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-xl" onClick={() => onAplicarVencimiento(p, pct)}>
                        Aplicar {pct}% off
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </Seccion>
          )}

          {quietas.length > 0 && (
            <Seccion icono={Snowflake} titulo="Mercadería quieta" cantidad={quietas.length} tono="text-sky-500">
              {quietas.map(({ producto: p, sugerencia: s }) => (
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
            </Seccion>
          )}

          {aReponer.length > 0 && (
            <Seccion icono={PackagePlus} titulo="Se agotan pronto" cantidad={aReponer.length} tono="text-destructive">
              {aReponer.map((r) => (
                <li key={r.productoId} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Quedan {r.stockActual} · vende {r.velocidadDiaria.toLocaleString("es-AR")}/día
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    {r.diasRestantes === 0 ? "hoy" : `${r.diasRestantes} d`}
                  </span>
                </li>
              ))}
            </Seccion>
          )}
        </div>
      )}
    </div>
  );
}
