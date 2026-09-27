"use client";
// components/stock/centro-ofertas.tsx — todas las ofertas en un solo lugar:
// estado (vigente / programada / vencida), si estan vendiendo mas que antes, y
// acciones en lote (folleto A4, carteles, WhatsApp con todas, finalizar vencidas).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, FileText, Megaphone, MessageCircle, Pencil, Printer, TrendingDown, TrendingUp, X, Minus, Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { etiquetaOferta, textoFolletoOfertas } from "@/lib/oferta-analisis";
import { estadoVigencia, textoVigencia, type EstadoVigencia } from "@/lib/oferta-vigencia";
import { veredictoOferta, type ResultadoOferta } from "@/lib/oferta-resultados";
import { useNombreComercio } from "@/components/stock/oferta-publicada";
import { getOfertas, setOferta, type OfertaConResultado } from "@/services/products-service";
import type { Product } from "@/lib/types";

interface CentroOfertasProps {
  /** Cambia cada vez que el padre guarda una oferta, para recargar. */
  version: number;
  onEditar: (p: Product) => void;
  onImprimirCarteles: (productos: Product[], comercio: string) => void;
  onImprimirFolleto: (productos: Product[], comercio: string) => void;
  /** Avisa al padre que cambio el catalogo (para refrescar la tabla). */
  onCambio: () => void;
}

const ESTADO: Record<Exclude<EstadoVigencia, "sin-fecha">, { label: string; clase: string }> = {
  vigente: { label: "Vigente", clase: "bg-money/15 text-money" },
  programada: { label: "Programada", clase: "bg-primary/15 text-primary" },
  vencida: { label: "Vencida", clase: "bg-muted text-muted-foreground" },
};

function estadoDe(p: Product): Exclude<EstadoVigencia, "sin-fecha"> {
  const e = estadoVigencia(p.ofertaDesde, p.ofertaHasta);
  return e === "sin-fecha" ? "vigente" : e;
}

function Resultado({ r }: { r?: ResultadoOferta }) {
  if (!r) return <span className="text-xs text-muted-foreground">Sin fecha de inicio para medir</span>;
  const v = veredictoOferta(r);
  const ritmo = `${r.porDiaDurante.toLocaleString("es-AR")}/día`;
  if (v === "temprano") {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Hourglass className="h-3 w-3" /> Recién arranca · {r.unidadesDurante} vendidas</span>;
  }
  if (v === "sin-base") {
    return <span className="text-xs text-money">Vendió {r.unidadesDurante} u. ({ritmo}); antes casi no salía</span>;
  }
  const cfg = {
    funciona: { Icon: TrendingUp, clase: "text-money", texto: `+${r.variacionPct}% · ${ritmo} (antes ${r.porDiaAntes.toLocaleString("es-AR")})` },
    igual: { Icon: Minus, clase: "text-muted-foreground", texto: `Vende igual que antes (${ritmo})` },
    floja: { Icon: TrendingDown, clase: "text-destructive", texto: `${r.variacionPct}% · probá una promo más fuerte` },
  }[v];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", cfg.clase)}>
      <cfg.Icon className="h-3.5 w-3.5" /> {cfg.texto}
    </span>
  );
}

export function CentroOfertas({ version, onEditar, onImprimirCarteles, onImprimirFolleto, onCambio }: CentroOfertasProps) {
  const [ofertas, setOfertas] = useState<OfertaConResultado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [finalizando, setFinalizando] = useState<string | null>(null);
  const [comercio] = useNombreComercio();

  const cargar = useCallback(async () => {
    try {
      setOfertas(await getOfertas());
    } catch {
      // el panel es un extra: si falla no se muestra y el resto de Stock sigue
      setOfertas([]);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar, version]);

  const resumen = useMemo(() => {
    const porEstado = { vigente: 0, programada: 0, vencida: 0 };
    let facturado = 0;
    let mejor: OfertaConResultado | null = null;
    for (const o of ofertas) {
      porEstado[estadoDe(o.producto)]++;
      if (o.resultado) {
        facturado += o.resultado.facturadoDurante;
        if (veredictoOferta(o.resultado) === "funciona" && (o.resultado.variacionPct ?? 0) > (mejor?.resultado?.variacionPct ?? 0)) mejor = o;
      }
    }
    return { porEstado, facturado, mejor };
  }, [ofertas]);

  if (ofertas.length === 0) return null;

  const publicables = ofertas.map((o) => o.producto).filter((p) => estadoDe(p) !== "vencida");
  const vencidas = ofertas.map((o) => o.producto).filter((p) => estadoDe(p) === "vencida");
  const nombre = comercio.trim();

  const finalizar = async (productos: Product[]) => {
    setFinalizando(productos.length === 1 ? productos[0].id : "todas");
    try {
      await Promise.all(productos.map((p) => setOferta(p.id, { activa: false, desde: null, hasta: null })));
      toast.success(productos.length === 1 ? `Oferta de ${productos[0].name} finalizada` : `${productos.length} ofertas finalizadas`);
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo finalizar la oferta");
    } finally {
      setFinalizando(null);
    }
  };

  const whatsappTodas = () => {
    const texto = textoFolletoOfertas(publicables, nombre || undefined);
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };

  const { porEstado } = resumen;
  const partes = [
    porEstado.vigente && `${porEstado.vigente} vigente${porEstado.vigente > 1 ? "s" : ""}`,
    porEstado.programada && `${porEstado.programada} programada${porEstado.programada > 1 ? "s" : ""}`,
    porEstado.vencida && `${porEstado.vencida} vencida${porEstado.vencida > 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <div className="card-premium mb-4 rounded-2xl p-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-money/15 text-money">
            <Megaphone className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold">Centro de ofertas</p>
            <p className="text-xs text-muted-foreground">
              {partes.join(" · ")}
              {resumen.facturado > 0 && <> · <span className="cifra">{formatCurrency(resumen.facturado)}</span> vendidos en oferta</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {resumen.mejor && (
            <span className="hidden rounded-full bg-money/15 px-3 py-1 text-xs font-semibold text-money sm:inline">
              🔥 {resumen.mejor.producto.name.slice(0, 24)} vende +{resumen.mejor.resultado?.variacionPct}%
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        </div>
      </button>

      {abierto && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button size="sm" className="rounded-xl" disabled={publicables.length === 0} onClick={() => onImprimirFolleto(publicables, nombre)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Folleto A4
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={publicables.length === 0} onClick={() => onImprimirCarteles(publicables, nombre)}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Todos los carteles ({publicables.length})
            </Button>
            <Button
              size="sm" variant="outline" disabled={publicables.length === 0} onClick={whatsappTodas}
              className="rounded-xl border-[#25d366]/50 text-[#128c4a] hover:bg-[#25d366]/10 dark:text-[#25d366]"
            >
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp con todas
            </Button>
            {vencidas.length > 0 && (
              <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" disabled={finalizando != null} onClick={() => finalizar(vencidas)}>
                <X className="mr-1 h-3.5 w-3.5" /> Limpiar vencidas ({vencidas.length})
              </Button>
            )}
          </div>

          <ul className="mt-2 divide-y divide-border/60">
            {ofertas.map(({ producto: p, resultado }) => {
              const estado = estadoDe(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="rounded-lg bg-[#ffd400] px-2 py-0.5 text-xs font-black text-[#d7141a]">{etiquetaOferta(p)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn("rounded-full px-2 py-px text-[10px] font-semibold uppercase", ESTADO[estado].clase)}>
                        {ESTADO[estado].label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{textoVigencia(p.ofertaDesde, p.ofertaHasta)}</span>
                      {estado === "vigente" && <Resultado r={resultado} />}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl" title="Editar oferta" onClick={() => onEditar(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {estado !== "vencida" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl" title="Imprimir cartel" onClick={() => onImprimirCarteles([p], nombre)}>
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive"
                      title="Finalizar oferta" disabled={finalizando != null} onClick={() => finalizar([p])}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
