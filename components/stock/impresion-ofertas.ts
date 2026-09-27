// components/stock/impresion-ofertas.ts — piezas compartidas para imprimir carteles y
// folletos de oferta (las usan Stock y Promociones).
import { ofertaConfigurada } from "@/lib/pricing";
import { estadoVigencia } from "@/lib/oferta-vigencia";
import { formatoCartelGuardado, temaCartelGuardado, type OpcionesCartel } from "@/components/stock/cartel-preferencias";
import type { Product } from "@/lib/types";

/** Tiene cartel quien tiene oferta vigente o programada (el cartel del finde se imprime antes). Las vencidas no. */
export function conCartel(p: Product): boolean {
  return ofertaConfigurada(p) && estadoVigencia(p.ofertaDesde, p.ofertaHasta) !== "vencida";
}

/** Sin opciones explicitas se usa lo ultimo elegido en este navegador. */
export function opcionesCartel(o?: Partial<OpcionesCartel>): OpcionesCartel {
  return {
    comercio: o?.comercio ?? "",
    formato: o?.formato ?? formatoCartelGuardado(),
    tema: o?.tema ?? temaCartelGuardado(),
  };
}

/**
 * Imprime en A4 lo que se acaba de poner en pantalla. El @page se inyecta solo
 * para este print job: no se define en globals.css porque pisaria el @page de
 * 80mm del ticket termico. Despues se limpia el estado para que el proximo
 * print no arrastre lo anterior.
 */
export function imprimirA4(margen: string, limpiar: () => void, pagina = "A4"): void {
  setTimeout(() => {
    const style = document.createElement("style");
    style.textContent = `@page { size: ${pagina}; margin: ${margen}; }`;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
    limpiar();
  }, 150);
}
