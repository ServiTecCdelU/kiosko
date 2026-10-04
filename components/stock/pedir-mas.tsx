"use client";
// components/stock/pedir-mas.tsx — "Pedí más: se vende bien". Avisa qué productos
// se venden rápido (o más rápido que antes), por qué, y cuánto conviene pedir.
// La lógica está en lib/pedir-mas.ts; acá solo se muestra y se arma el pedido.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, MessageCircle, PackageCheck, TrendingUp, Zap, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getRitmoVenta } from "@/services/products-service";
import { cantidadTexto, explicarPedido, sugerirPedidos, textoPedido, type MotivoPedido, type SugerenciaPedido } from "@/lib/pedir-mas";
import { useAuth } from "@/hooks/use-auth";

const VISIBLES = 5;

const CHIPS: Record<MotivoPedido, { texto: (s: SugerenciaPedido) => string; icono: typeof Zap; clase: string }> = {
  "se-agota": { texto: () => "Se agota", icono: Flame, clase: "bg-destructive/10 text-destructive" },
  acelera: { texto: (s) => `Vende +${s.cambioPct}%`, icono: TrendingUp, clase: "bg-money/15 text-money" },
  "compra-rapida": { texto: () => "Compra volando", icono: Zap, clase: "bg-warning/15 text-warning" },
};

export function PedirMas() {
  const { user } = useAuth();
  const [sugerencias, setSugerencias] = useState<SugerenciaPedido[] | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState(true);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    let vigente = true;
    getRitmoVenta(14)
      .then(({ productos, dias }) => {
        if (vigente) setSugerencias(sugerirPedidos(productos, dias, new Date()));
      })
      .catch(() => {
        if (vigente) setError(true);
      });
    return () => {
      vigente = false;
    };
  }, []);

  const visibles = useMemo(
    () => (sugerencias ?? []).slice(0, verTodos ? undefined : VISIBLES),
    [sugerencias, verTodos],
  );

  // Siempre visible: aunque no haya nada para pedir, el dueño sabe que la sección existe
  if (error || !sugerencias || sugerencias.length === 0) {
    return (
      <section className="card-premium mb-4 flex items-center gap-2 rounded-2xl p-5" aria-label="Pedí más: se vende bien">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-money/15 text-money">
          <TrendingUp className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold">Pedí más: se vende bien</p>
          <p className="text-xs text-muted-foreground">
            {error
              ? "No se pudo calcular qué conviene pedir. Probá de nuevo en un rato."
              : !sugerencias
                ? "Calculando qué se está vendiendo bien…"
                : "Por ahora no hace falta pedir nada: lo que se vende tiene stock para 2 semanas. Te avisamos acá cuando algo se venda más rápido."}
          </p>
        </div>
      </section>
    );
  }

  const paraYa = sugerencias.filter((s) => s.cuando === "ahora");
  const proxima = sugerencias.length - paraYa.length;
  // El pedido al proveedor lleva lo que hay que reponer ya; si no hay, el de la proxima compra
  const pedido = textoPedido(paraYa.length > 0 ? paraYa : sugerencias, user?.comercioNombre);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pedido);
      toast.success("Pedido copiado: pegalo en el chat del proveedor");
    } catch {
      toast.error("No se pudo copiar. Probá con el botón de WhatsApp.");
    }
  };

  return (
    <section className="card-premium mb-4 rounded-2xl p-5" aria-labelledby="pedir-mas-titulo">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-money/15 text-money">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div>
            <p id="pedir-mas-titulo" className="font-semibold">Pedí más: se vende bien</p>
            <p className="text-xs text-muted-foreground">
              {paraYa.length > 0 && <span className="font-medium text-destructive">{paraYa.length} para pedir ya</span>}
              {paraYa.length > 0 && proxima > 0 && " · "}
              {proxima > 0 && <>{proxima} para pedir más la próxima vez</>}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <>
          <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
            {visibles.map((s) => (
              <li key={s.producto.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium">{s.producto.nombre}</p>
                    {s.motivos.map((m) => {
                      const c = CHIPS[m];
                      return (
                        <span key={m} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", c.clase)}>
                          <c.icono className="h-3 w-3" /> {c.texto(s)}
                        </span>
                      );
                    })}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {explicarPedido(s).map((t) => <li key={t}>{t}</li>)}
                    <li>Tenés {cantidadTexto(s.producto.stock, s.producto.unidad)} · vendés {s.ritmoDiario.toLocaleString("es-AR", { maximumFractionDigits: 1 })} por día</li>
                  </ul>
                </div>
                <div className={cn("shrink-0 rounded-xl px-3 py-2 text-right", s.cuando === "ahora" ? "bg-money/10" : "bg-muted/60")}>
                  <p className="text-[11px] text-muted-foreground">{s.cuando === "ahora" ? "Pedí ya" : "La próxima, pedí"}</p>
                  <p className="cifra text-lg font-bold leading-tight text-money">{cantidadTexto(s.cantidad, s.producto.unidad)}</p>
                  {s.vecesUltimaCompra != null && s.producto.ultimaCompra && (
                    <p className="text-[11px] text-muted-foreground">
                      {s.vecesUltimaCompra === 1
                        ? "lo mismo que la última vez"
                        : `${s.vecesUltimaCompra} veces tu última compra (${cantidadTexto(s.producto.ultimaCompra.cantidad, s.producto.unidad)})`}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {sugerencias.length > VISIBLES && (
            <button onClick={() => setVerTodos((v) => !v)} className="mt-1 text-sm font-medium text-primary hover:underline">
              {verTodos ? "Ver menos" : `Ver los ${sugerencias.length}`}
            </button>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={copiar}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar pedido
            </Button>
            <Button
              size="sm" variant="outline"
              className="rounded-xl border-[#25d366]/50 text-[#128c4a] hover:bg-[#25d366]/10 dark:text-[#25d366]"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(pedido)}`, "_blank", "noopener,noreferrer")}
            >
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Mandar por WhatsApp
            </Button>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5" /> Calculado para que te alcance 2 semanas, según lo que vendiste en las últimas 2.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
