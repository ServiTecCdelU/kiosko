// lib/oferta-analisis.ts — "cuanto gano y cuanto pierdo" con una oferta.
// Puro (sin React ni Supabase): lo usa el estudio de ofertas y se testea con node:test.
import type { OfertaTipo } from "@/lib/types";
import { type ConOferta, tieneOferta, precioFinal, comboLabel, pesos } from "./pricing.ts";

export interface ConCosto extends ConOferta {
  /** Costo de compra (precio_base). Sin costo no se pueden calcular margenes. */
  precioBase?: number | null;
}

export interface AnalisisOferta {
  /** Unidades que abarca la promo (1, o N en un combo). */
  unidades: number;
  /** Lo que paga el cliente por esas unidades con la oferta. */
  totalPromo: number;
  /** Precio efectivo por unidad llevando la promo completa. */
  precioUnitario: number;
  /** Ahorro del cliente sobre las unidades de la promo. */
  ahorroTotal: number;
  ahorroPct: number;
  margenActualPct: number | null;
  margenOfertaPct: number | null;
  /** Ganancia por unidad con la oferta (puede ser negativa). */
  gananciaUnitaria: number | null;
  bajoCosto: boolean;
  /** % de unidades extra que hay que vender para ganar lo mismo que sin oferta. */
  ventasExtraPct: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

function margenPct(precio: number, costo: number): number {
  return precio > 0 ? round1(((precio - costo) / precio) * 100) : 0;
}

export function analizarOferta(p: ConCosto): AnalisisOferta {
  const valida = tieneOferta(p);
  const esCombo = valida && p.ofertaTipo === "combo";
  const unidades = esCombo ? Number(p.ofertaCantidad) : 1;
  const totalPromo = esCombo ? Number(p.ofertaValor) : precioFinal(p);
  const precioUnitario = round2(totalPromo / unidades);
  const totalLista = p.price * unidades;
  const ahorroTotal = round2(Math.max(0, totalLista - totalPromo));
  const ahorroPct = totalLista > 0 ? Math.round((ahorroTotal / totalLista) * 100) : 0;

  const costo = p.precioBase != null && p.precioBase > 0 ? Number(p.precioBase) : null;
  if (costo == null) {
    return {
      unidades, totalPromo, precioUnitario, ahorroTotal, ahorroPct,
      margenActualPct: null, margenOfertaPct: null, gananciaUnitaria: null,
      bajoCosto: false, ventasExtraPct: null,
    };
  }

  const gananciaActual = p.price - costo;
  const gananciaUnitaria = round2(precioUnitario - costo);
  const ventasExtraPct =
    gananciaActual > 0 && gananciaUnitaria > 0
      ? Math.round((gananciaActual / gananciaUnitaria - 1) * 100)
      : null;

  return {
    unidades, totalPromo, precioUnitario, ahorroTotal, ahorroPct,
    margenActualPct: margenPct(p.price, costo),
    margenOfertaPct: margenPct(precioUnitario, costo),
    gananciaUnitaria,
    bajoCosto: precioUnitario < costo,
    ventasExtraPct,
  };
}

/** Texto corto de la oferta para badges, etiquetas y carteles: "-20%", "-$200", "3x2"... */
export function etiquetaOferta(p: ConOferta): string | null {
  if (!tieneOferta(p)) return null;
  if (p.ofertaTipo === "combo") return comboLabel(p);
  const valor = Number(p.ofertaValor);
  return p.ofertaTipo === "porcentaje" ? `-${valor}%` : `-${pesos(valor)}`;
}

/**
 * Precio "psicologico" inmediatamente por debajo: $1.843 -> $1.790, $463 -> $459.
 * Los carteles con precios terminados en 90/9 se leen como mas baratos.
 */
export function precioRedondo(precio: number): number {
  if (precio >= 1000) return Math.floor((precio + 10) / 100) * 100 - 10;
  if (precio >= 100) return Math.floor((precio + 1) / 10) * 10 - 1;
  return Math.floor(precio);
}

export interface PlantillaOferta {
  id: string;
  label: string;
  descripcion: string;
  oferta: { tipo: OfertaTipo; valor: number; cantidad?: number };
}

/** Las promos que mas se usan en un super, calculadas sobre el precio actual. */
export function plantillasOferta(precio: number): PlantillaOferta[] {
  const combo = (id: string, label: string, descripcion: string, cantidad: number, valor: number): PlantillaOferta => ({
    id, label, descripcion, oferta: { tipo: "combo", cantidad, valor: round2(valor) },
  });
  const pct = (valor: number): PlantillaOferta => ({
    id: `p${valor}`, label: `-${valor}%`, descripcion: `${valor}% de descuento`,
    oferta: { tipo: "porcentaje", valor },
  });
  return [
    combo("2x1", "2x1", "Lleva 2, paga 1", 2, precio),
    combo("3x2", "3x2", "Lleva 3, paga 2", 3, precio * 2),
    combo("4x3", "4x3", "Lleva 4, paga 3", 4, precio * 3),
    combo("2da50", "2da al 50%", "La segunda a mitad de precio", 2, precio * 1.5),
    combo("2da70", "-70% 2da", "70% off en la segunda", 2, precio * 1.3),
    pct(10),
    pct(20),
    pct(30),
  ];
}

interface ConNombre extends ConOferta {
  name: string;
  unidad?: "un" | "kg";
}

/** Mensaje listo para mandar por WhatsApp (estados, grupos del barrio). */
export function textoCompartirOferta(p: ConNombre, comercio?: string): string {
  const a = analizarOferta(p);
  const etiqueta = etiquetaOferta(p);
  const porKg = p.unidad === "kg" ? "/kg" : "";
  const lineas =
    p.ofertaTipo === "combo" && etiqueta
      ? [
          `🔥 *¡OFERTA ${etiqueta}!* 🔥`,
          `🛒 *${p.name}*`,
          `Llevando ${a.unidades} pagás ${pesos(a.totalPromo)} (en vez de ${pesos(p.price * a.unidades)})`,
        ]
      : [
          `🔥 *¡OFERTA!* 🔥`,
          `🛒 *${p.name}*`,
          `~${pesos(p.price)}${porKg}~ ➜ *${pesos(a.totalPromo)}${porKg}*${a.ahorroPct > 0 ? ` (-${a.ahorroPct}%)` : ""}`,
        ];
  if (a.ahorroTotal > 0) lineas.push(`💰 Ahorrás ${pesos(a.ahorroTotal)}`);
  if (comercio) lineas.push(`📍 ${comercio}`);
  lineas.push("¡Hasta agotar stock!");
  return lineas.join("\n");
}
