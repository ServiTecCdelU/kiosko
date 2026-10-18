// lib/unidades.ts — como se vende un producto. Puro (lo usan navegador, servidor y tests).
//
// "un" se vende por unidad entera. kg, m y l son fraccionables: se venden con
// hasta 3 decimales (gramos, milimetros, mililitros) y el precio es por esa unidad.
// Solo kg se lee de la balanza (lib/barcode-balanza.ts).
// Debe coincidir con productos_unidad_check (63_unidades_metro_litro.sql).

export type Unidad = "un" | "kg" | "m" | "l";

export const UNIDADES: { valor: Unidad; label: string; ejemplo: string }[] = [
  { valor: "un", label: "Unidad", ejemplo: "un paquete, una lata" },
  { valor: "kg", label: "Peso (kg)", ejemplo: "pan, verdura, fiambre" },
  { valor: "m", label: "Metro (m)", ejemplo: "cable, manguera, cadena" },
  { valor: "l", label: "Litro (l)", ejemplo: "pintura suelta, aceite, lavandina" },
];

export function esUnidad(valor: unknown): valor is Unidad {
  return valor === "un" || valor === "kg" || valor === "m" || valor === "l";
}

/** Normaliza lo que venga de la base o del navegador; cualquier otra cosa es "un". */
export function unidadValida(valor: unknown): Unidad {
  return esUnidad(valor) ? valor : "un";
}

/** kg, m y l se venden con decimales; "un" solo enteros. */
export function esFraccionable(unidad: string | null | undefined): boolean {
  return unidad === "kg" || unidad === "m" || unidad === "l";
}

/** "kg", "m", "l" o "" para unidad. */
export function simboloUnidad(unidad: string | null | undefined): string {
  return esFraccionable(unidad) ? String(unidad) : "";
}

/** Sufijo de precio: "/kg", "/m", "/l" o "". */
export function porUnidad(unidad: string | null | undefined): string {
  return esFraccionable(unidad) ? `/${unidad}` : "";
}

/** Nombre de la magnitud para rotulos: "peso", "metros", "litros". */
export function magnitud(unidad: string | null | undefined): string {
  return unidad === "m" ? "metros" : unidad === "l" ? "litros" : "peso";
}
