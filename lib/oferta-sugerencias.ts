// lib/oferta-sugerencias.ts — ¿que conviene ofertar? Detecta mercaderia quieta
// y productos con margen de sobra que rotan poco, y elige la promo mas fuerte
// que todavia deja un margen minimo. Puro: el endpoint trae stock y ventas.
import { analizarOferta, plantillasOferta, type PlantillaOferta } from "./oferta-analisis.ts";

export interface CandidatoOferta {
  price: number;
  precioBase?: number;
  stock: number;
  /** Unidades vendidas en los ultimos `diasHistoria` dias. */
  unidadesVendidas: number;
  /** Dias de historia disponibles (un producto recien creado tiene menos). */
  diasHistoria: number;
  unidad: "un" | "kg";
}

export type MotivoSugerencia = "sin-ventas" | "estancado" | "margen-alto";

export interface SugerenciaOferta {
  motivo: MotivoSugerencia;
  porDia: number;
  /** Dias que dura el stock al ritmo actual; null si no se vende. */
  diasDeStock: number | null;
  /** Plata inmovilizada en ese stock (a costo, o a precio si no hay costo). */
  capital: number;
  plantilla: PlantillaOferta;
  margenOfertaPct: number | null;
}

const HISTORIA_MIN = 14;
const DIAS_ESTANCADO = 60;
const STOCK_MIN_SIN_VENTAS = 3;
const MARGEN_ALTO = 40;
const ROTACION_BAJA = 0.5;
const STOCK_MIN_MARGEN = 5;
/** Margen que la oferta sugerida tiene que dejar, como minimo. */
export const MARGEN_MINIMO = 10;

// De la mas fuerte a la mas suave, segun cuanto urge mover el stock
const PREFERENCIAS: Record<MotivoSugerencia, string[]> = {
  "sin-ventas": ["3x2", "2da50", "p30", "p20", "p10"],
  estancado: ["3x2", "2da50", "p20", "p10"],
  "margen-alto": ["p20", "2da50", "p10"],
};

function motivoDe(c: CandidatoOferta, porDia: number, diasDeStock: number | null): MotivoSugerencia | null {
  if (c.unidadesVendidas <= 0) return c.stock >= STOCK_MIN_SIN_VENTAS ? "sin-ventas" : null;
  if (diasDeStock != null && diasDeStock > DIAS_ESTANCADO) return "estancado";
  const margen = c.precioBase && c.price > 0 ? ((c.price - c.precioBase) / c.price) * 100 : null;
  if (margen != null && margen >= MARGEN_ALTO && porDia < ROTACION_BAJA && c.stock >= STOCK_MIN_MARGEN) {
    return "margen-alto";
  }
  return null;
}

export function sugerirOferta(c: CandidatoOferta): SugerenciaOferta | null {
  if (c.stock <= 0 || c.price <= 0 || c.diasHistoria < HISTORIA_MIN) return null;
  const porDia = Math.round((c.unidadesVendidas / c.diasHistoria) * 100) / 100;
  const diasDeStock = c.unidadesVendidas > 0 ? Math.round(c.stock / (c.unidadesVendidas / c.diasHistoria)) : null;
  const motivo = motivoDe(c, porDia, diasDeStock);
  if (!motivo) return null;

  const plantillas = plantillasOferta(c.price).filter((p) => c.unidad !== "kg" || p.oferta.tipo !== "combo");
  const opciones = PREFERENCIAS[motivo]
    .map((id) => plantillas.find((p) => p.id === id))
    .filter((p): p is PlantillaOferta => !!p);
  if (opciones.length === 0) return null;

  const evaluar = (p: PlantillaOferta) =>
    analizarOferta({
      price: c.price, precioBase: c.precioBase, ofertaActiva: true,
      ofertaTipo: p.oferta.tipo, ofertaValor: p.oferta.valor, ofertaCantidad: p.oferta.cantidad,
    }).margenOfertaPct;

  // Sin costo no se puede medir el margen: se va a lo seguro, la promo mas suave
  const elegida = c.precioBase
    ? opciones.find((p) => (evaluar(p) ?? -1) >= MARGEN_MINIMO)
    : opciones[opciones.length - 1];
  if (!elegida) return null;

  return {
    motivo, porDia, diasDeStock,
    capital: Math.round(c.stock * (c.precioBase || c.price)),
    plantilla: elegida,
    margenOfertaPct: evaluar(elegida),
  };
}
