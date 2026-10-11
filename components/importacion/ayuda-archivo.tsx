"use client";
// components/importacion/ayuda-archivo.tsx — "cartelito" de ayuda para importar
// una planilla: que columnas lleva, plantilla para descargar (Excel o CSV) y
// el WhatsApp de soporte por si el comercio prefiere mandarnos el archivo.
import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Lightbulb, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WhatsAppLink } from "@/components/analytics/whatsapp-link";

export interface ColumnaAyuda {
  nombre: string;
  ejemplo: string;
  obligatoria?: boolean;
}

interface AyudaArchivoProps {
  /** Que se importa, en plural: "productos", "clientes". */
  que: string;
  columnas: ColumnaAyuda[];
  onPlantilla: (formato: "xlsx" | "csv") => void;
  /** Para el tracking del click en WhatsApp. */
  ubicacion: string;
  /** Abierto de entrada (cuando todavia no se eligio archivo). */
  abiertoAlInicio?: boolean;
}

export function AyudaArchivo({ que, columnas, onPlantilla, ubicacion, abiertoAlInicio = true }: AyudaArchivoProps) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
        aria-expanded={abierto}
      >
        <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> ¿Cómo armo el archivo de {que}?</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div className="space-y-3 border-t border-primary/20 px-3 py-3 text-xs">
          <ul className="space-y-1 text-muted-foreground">
            <li>Sirve un <b className="text-foreground">Excel</b> (.xlsx) o un <b className="text-foreground">CSV</b> exportado de otro sistema, Google Sheets o un celular.</li>
            <li>Una fila por {que.replace(/s$/, "")}. La primera fila puede tener títulos: los reconocemos solos, y si no, elegís la columna a mano.</li>
            <li>Si no estás seguro, bajá la plantilla, completala y subila tal cual.</li>
          </ul>
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full">
              <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-2 py-1">Columna</th><th className="px-2 py-1">Ejemplo</th></tr>
              </thead>
              <tbody>
                {columnas.map((c) => (
                  <tr key={c.nombre} className="border-t">
                    <td className="px-2 py-1">
                      {c.nombre}
                      {c.obligatoria && <span className="ml-1 text-[10px] font-semibold uppercase text-primary">obligatoria</span>}
                    </td>
                    <td className="cifra px-2 py-1 text-muted-foreground">{c.ejemplo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl" onClick={() => onPlantilla("xlsx")}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Plantilla Excel
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl" onClick={() => onPlantilla("csv")}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Plantilla CSV
            </Button>
            <Download className="hidden h-3.5 w-3.5" />
          </div>
          <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5 text-success" />
            ¿Te trabás? Mandanos el archivo por
            <WhatsAppLink ubicacion={ubicacion} mensaje={`Hola! Quiero cargar mis ${que} en MultiComercioPanel y necesito una mano con el archivo.`} className="font-medium text-success hover:underline">
              WhatsApp
            </WhatsAppLink>
            y lo cargamos con vos. No se pierde nada.
          </p>
        </div>
      )}
    </div>
  );
}
