"use client";
// components/stock/cartel-preferencias.tsx — tamaño y tema de temporada de los
// carteles, recordados por navegador, y sus selectores. Los usan el estudio de
// ofertas, el Centro de ofertas y la impresion desde Stock.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TEMAS_CARTEL, temaCartel, type TemaCartelId } from "@/lib/cartel-temas";

export type FormatoCartel = "a4" | "a5" | "a6";

export const FORMATOS_CARTEL: { value: FormatoCartel; label: string; porHoja: number; page: string }[] = [
  { value: "a4", label: "Hoja entera", porHoja: 1, page: "A4" },
  { value: "a5", label: "Media hoja", porHoja: 2, page: "A4 landscape" },
  { value: "a6", label: "Cuarto de hoja", porHoja: 4, page: "A4" },
];

/** Como sale impreso un cartel (o el folleto, que solo usa comercio y tema). */
export interface OpcionesCartel {
  comercio: string;
  formato: FormatoCartel;
  tema: TemaCartelId;
}

const FORMATO_KEY = "kiosko:cartel-formato";
const TEMA_KEY = "kiosko:cartel-tema";

function leer(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // sin storage (modo privado): valores por defecto
  }
}

function guardar(key: string, valor: string): void {
  try {
    localStorage.setItem(key, valor);
  } catch {
    // idem
  }
}

/** Lectura puntual del tamaño guardado (para imprimir desde donde no hay selector). */
export function formatoCartelGuardado(): FormatoCartel {
  const v = leer(FORMATO_KEY);
  return FORMATOS_CARTEL.some((f) => f.value === v) ? (v as FormatoCartel) : "a4";
}

export function temaCartelGuardado(): TemaCartelId {
  return temaCartel(leer(TEMA_KEY)).id;
}

export function useFormatoCartel(): [FormatoCartel, (f: FormatoCartel) => void] {
  const [formato, setFormato] = useState<FormatoCartel>("a4");
  useEffect(() => { setFormato(formatoCartelGuardado()); }, []);
  return [formato, (f) => { setFormato(f); guardar(FORMATO_KEY, f); }];
}

export function useTemaCartel(): [TemaCartelId, (t: TemaCartelId) => void] {
  const [tema, setTema] = useState<TemaCartelId>("clasico");
  useEffect(() => { setTema(temaCartelGuardado()); }, []);
  return [tema, (t) => { setTema(t); guardar(TEMA_KEY, t); }];
}

export function FormatoCartelSelector({ value, onChange }: { value: FormatoCartel; onChange: (f: FormatoCartel) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Tamaño del cartel">
      {FORMATOS_CARTEL.map((f) => (
        <button
          key={f.value}
          role="radio"
          aria-checked={value === f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            "rounded-lg py-1.5 text-xs font-medium transition-colors",
            value === f.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Muestras de color de cada tema: el color es el dato, por eso va inline. */
export function TemaCartelSelector({ value, onChange }: { value: TemaCartelId; onChange: (t: TemaCartelId) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tema del cartel">
      {TEMAS_CARTEL.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-all",
            value === t.id ? "border-foreground/60 bg-muted shadow-sm" : "hover:bg-muted/60",
          )}
        >
          <span className="flex h-4 w-4 overflow-hidden rounded-full ring-1 ring-black/10">
            <span className="h-full w-1/2" style={{ background: t.principal }} />
            <span className="h-full w-1/2" style={{ background: t.badgeFondo }} />
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
