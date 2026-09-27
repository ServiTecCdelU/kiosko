// lib/cartel-temas.ts — temas de temporada para carteles, folleto e imagen de
// la oferta. Colores fijos a proposito: es papel/señaletica, no la UI del panel.
// Puro: lo usan componentes React y el generador de imagen (canvas).

export type TemaCartelId = "clasico" | "hotsale" | "navidad" | "liquidacion" | "finde" | "ultimos";

export interface TemaCartel {
  id: TemaCartelId;
  label: string;
  /** Titulo grande del cartel. */
  titulo: string;
  /** Franja del titulo, borde y detalles. */
  principal: string;
  /** Oscuro del mismo tono (sombras, degradados). */
  profundo: string;
  /** Fondo y texto del badge de la promo. */
  badgeFondo: string;
  badgeTexto: string;
}

export const TEMAS_CARTEL: TemaCartel[] = [
  { id: "clasico", label: "Clásico", titulo: "¡OFERTA!", principal: "#d7141a", profundo: "#6e070b", badgeFondo: "#ffd400", badgeTexto: "#d7141a" },
  { id: "hotsale", label: "Hot Sale", titulo: "HOT SALE", principal: "#ff4d00", profundo: "#7a1f00", badgeFondo: "#111111", badgeTexto: "#ffd400" },
  { id: "navidad", label: "Navidad", titulo: "¡OFERTA NAVIDEÑA!", principal: "#0f6b3a", profundo: "#06331b", badgeFondo: "#d7141a", badgeTexto: "#ffffff" },
  { id: "liquidacion", label: "Liquidación", titulo: "LIQUIDACIÓN", principal: "#111111", profundo: "#000000", badgeFondo: "#ffd400", badgeTexto: "#111111" },
  { id: "finde", label: "Finde", titulo: "¡OFERTA DEL FINDE!", principal: "#1d4ed8", profundo: "#0b2266", badgeFondo: "#ffd400", badgeTexto: "#1d4ed8" },
  { id: "ultimos", label: "Últimos días", titulo: "¡ÚLTIMOS DÍAS!", principal: "#7c1fbf", profundo: "#330a52", badgeFondo: "#ffd400", badgeTexto: "#7c1fbf" },
];

export function temaCartel(id: string | null | undefined): TemaCartel {
  return TEMAS_CARTEL.find((t) => t.id === id) ?? TEMAS_CARTEL[0];
}

/**
 * Tamaño de letra (em) del titulo para que entre en la franja: los titulos
 * largos ("¡OFERTA NAVIDEÑA!") van mas chicos que "¡OFERTA!".
 */
export function tamanoTitulo(titulo: string, ancho: number, max: number): number {
  return Math.min(max, ancho / Math.max(titulo.length * 0.62, 1));
}
