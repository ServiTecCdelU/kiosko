"use client";

// components/facturacion/tutorial/tareas-arca.tsx — lo que hay que hacer en la
// web de ARCA, como lista para ir tildando. Las tildes se recuerdan (por
// comercio) para retomar otro dia donde quedo.
import { useEffect, useState } from "react";
import { Check, ExternalLink, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { claveDelComercioActual } from "@/lib/clave-comercio";

export const URL_ARCA = "https://www.arca.gob.ar/";

export interface Tarea {
  id: string;
  texto: React.ReactNode;
  /** Ayuda desplegable ("¿No lo encontrás?"). */
  ayuda?: React.ReactNode;
}

function leer(clave: string | null): Record<string, boolean> {
  try {
    return clave ? (JSON.parse(localStorage.getItem(clave) ?? "{}") as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Tildes de una lista (persistidas). Devuelve [hechas, alternar]. */
export function useTildes(lista: string): [Record<string, boolean>, (id: string) => void] {
  const [hechas, setHechas] = useState<Record<string, boolean>>({});
  const clave = claveDelComercioActual(`kiosko:afip-tareas:${lista}`);
  useEffect(() => setHechas(leer(clave)), [clave]);
  const alternar = (id: string) => {
    setHechas((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        if (clave) localStorage.setItem(clave, JSON.stringify(next));
      } catch {
        // sin almacenamiento: las tildes duran mientras la pantalla este abierta
      }
      return next;
    });
  };
  return [hechas, alternar];
}

export function BotonArca({ texto = "Abrir ARCA" }: { texto?: string }) {
  return (
    <a
      href={URL_ARCA}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
    >
      {texto} <ExternalLink className="h-4 w-4" />
    </a>
  );
}

export function TareasArca({ tareas, hechas, onAlternar }: { tareas: Tarea[]; hechas: Record<string, boolean>; onAlternar: (id: string) => void }) {
  const [ayudaAbierta, setAyudaAbierta] = useState<string | null>(null);
  return (
    <ol className="space-y-2">
      {tareas.map((t, i) => {
        const hecha = !!hechas[t.id];
        return (
          <li key={t.id} className={cn("rounded-xl border p-3 transition-colors", hecha ? "border-success/40 bg-success/5" : "bg-card")}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onAlternar(t.id)}
                aria-label={hecha ? "Marcar como pendiente" : "Marcar como hecho"}
                aria-pressed={hecha}
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  hecha ? "border-success bg-success text-white" : "border-muted-foreground/40 text-muted-foreground hover:border-primary",
                )}
              >
                {hecha ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </button>
              <div className={cn("min-w-0 flex-1 text-sm", hecha && "text-muted-foreground")}>
                {t.texto}
                {t.ayuda && (
                  <button
                    type="button"
                    onClick={() => setAyudaAbierta(ayudaAbierta === t.id ? null : t.id)}
                    className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <HelpCircle className="h-3.5 w-3.5" /> ¿No lo encontrás?
                  </button>
                )}
                {ayudaAbierta === t.id && t.ayuda && (
                  <div className="mt-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">{t.ayuda}</div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
