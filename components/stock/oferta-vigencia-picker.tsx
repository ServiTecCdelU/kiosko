"use client";
// components/stock/oferta-vigencia-picker.tsx — "desde / hasta" de la oferta,
// con atajos (solo hoy, este finde, 7 dias, fin de mes). La oferta se prende y
// se apaga sola: el POS y /api/ventas la cobran solo dentro de esas fechas.
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { estadoVigencia, hoyArgentinaISO, presetsVigencia, textoVigencia } from "@/lib/oferta-vigencia";

interface OfertaVigenciaPickerProps {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}

export function OfertaVigenciaPicker({ desde, hasta, onChange }: OfertaVigenciaPickerProps) {
  const hoy = hoyArgentinaISO();
  const presets = presetsVigencia(hoy);
  const activo = presets.find((p) => (p.desde ?? "") === desde && (p.hasta ?? "") === hasta)?.id;
  const estado = estadoVigencia(desde || null, hasta || null, hoy);

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" /> Vigencia
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.desde ?? "", p.hasta ?? "")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activo === p.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={desde} onChange={(e) => onChange(e.target.value, hasta)} className="rounded-xl" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => onChange(desde, e.target.value)} className="rounded-xl" />
        </div>
      </div>
      {estado !== "sin-fecha" && (
        <p className={cn("mt-1.5 text-xs", estado === "vencida" ? "text-destructive" : "text-muted-foreground")}>
          {estado === "programada" && <>Programada: hasta que arranque se cobra el precio normal. </>}
          {estado === "vencida" ? "Esas fechas ya pasaron." : `${textoVigencia(desde || null, hasta || null)}. Después se apaga sola.`}
        </p>
      )}
    </div>
  );
}
