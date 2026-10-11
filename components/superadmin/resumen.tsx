"use client";
// components/superadmin/resumen.tsx — tarjetas de resumen del SaaS arriba del
// listado. Se calculan en el navegador con lo que ya trae "listar"; cada
// tarjeta es un filtro rapido del listado.
import { AlertTriangle, Building2, CircleDollarSign, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { esNuevo, necesitaAtencion, pagoAlDia, type Comercio, type PreciosPlan } from "@/components/superadmin/comun";

export type FiltroRapido = "todos" | "atencion" | "cobros" | "nuevos";

interface ResumenProps {
  comercios: Comercio[];
  precios: PreciosPlan;
  activo: FiltroRapido;
  onFiltro: (f: FiltroRapido) => void;
}

export function resumenDe(comercios: Comercio[], precios: PreciosPlan) {
  const activos = comercios.filter((c) => c.estado === "activo");
  const enPrueba = comercios.filter((c) => c.estado === "prueba");
  const atencion = comercios.filter((c) => necesitaAtencion(c, precios));
  const nuevos = comercios.filter(esNuevo);
  // Solo los activos con un plan que se cobra: Free (o precio 0) no paga.
  const cobrables = activos.filter((c) => (precios[c.plan] ?? 0) > 0);
  const alDia = cobrables.filter(pagoAlDia);
  return { activos, enPrueba, atencion, nuevos, cobrables, alDia };
}

export function Resumen({ comercios, precios, activo, onFiltro }: ResumenProps) {
  const r = resumenDe(comercios, precios);
  const bajas = comercios.length - r.activos.length - r.enPrueba.length;

  const tarjetas: {
    id: FiltroRapido; icono: typeof Building2; titulo: string; valor: number; detalle: string; tono: "normal" | "aviso" | "ok";
  }[] = [
    {
      id: "todos", icono: Building2, titulo: "Comercios", valor: comercios.length, tono: "normal",
      detalle: `${r.activos.length} activos · ${r.enPrueba.length} en prueba${bajas > 0 ? ` · ${bajas} sin uso` : ""}`,
    },
    {
      id: "atencion", icono: AlertTriangle, titulo: "Requieren atención", valor: r.atencion.length,
      tono: r.atencion.length > 0 ? "aviso" : "ok",
      detalle: r.atencion.length > 0 ? "pruebas por vencer, pagos o sin acceso" : "todo en orden",
    },
    {
      id: "cobros", icono: CircleDollarSign, titulo: "Cobros del mes", valor: r.alDia.length,
      tono: r.cobrables.length > 0 && r.alDia.length < r.cobrables.length ? "aviso" : "ok",
      detalle: r.cobrables.length === 0
        ? "ningún comercio con plan pago"
        : `de ${r.cobrables.length} con plan pago${r.alDia.length < r.cobrables.length ? ` · faltan ${r.cobrables.length - r.alDia.length}` : " · todos al día"}`,
    },
    {
      id: "nuevos", icono: Sparkles, titulo: "Altas esta semana", valor: r.nuevos.length, tono: "normal",
      detalle: r.nuevos.length > 0 ? "se registraron solos" : "sin altas nuevas",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tarjetas.map((t) => {
        const Icono = t.icono;
        const seleccionada = activo === t.id;
        const colorValor = t.tono === "aviso" && t.valor > 0 ? "text-warning" : t.tono === "ok" ? "text-success" : "text-foreground";
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onFiltro(seleccionada ? "todos" : t.id)}
            aria-pressed={seleccionada}
            className={cn(
              "card-premium group rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5",
              seleccionada && "ring-2 ring-primary/40 border-primary/50",
            )}
          >
            <div className="eyebrow flex items-center gap-1.5">
              <Icono className={cn("h-4 w-4", t.tono === "aviso" && t.valor > 0 ? "text-warning" : "text-primary")} />
              <span className="truncate">{t.titulo}</span>
            </div>
            <p className={cn("cifra-hero mt-2 text-3xl sm:text-[2.5rem]", colorValor)}>{t.valor}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{t.detalle}</p>
          </button>
        );
      })}
    </div>
  );
}
