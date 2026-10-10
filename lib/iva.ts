// lib/iva.ts — alicuotas de IVA de Argentina (migracion 47). Debe coincidir con
// el CHECK de productos.iva y con esAlicuotaIva en app/api/productos/route.ts.

export const ALICUOTAS_IVA: { value: number; label: string; ayuda?: string }[] = [
  { value: 21, label: "21 %", ayuda: "General: casi todo" },
  { value: 10.5, label: "10,5 %", ayuda: "Carne, frutas, verduras, pan, harina, leche sin aditivos" },
  { value: 0, label: "0 % (exento)", ayuda: "Leche fluida, agua común, libros" },
  { value: 27, label: "27 %", ayuda: "Servicios públicos a responsables inscriptos" },
  { value: 5, label: "5 %" },
  { value: 2.5, label: "2,5 %" },
];

export const IVA_DEFAULT = 21;

export function esAlicuotaIva(valor: unknown): boolean {
  return ALICUOTAS_IVA.some((a) => a.value === Number(valor));
}

export function labelIva(valor: number): string {
  return ALICUOTAS_IVA.find((a) => a.value === valor)?.label ?? `${valor} %`;
}

/** Neto sin IVA a partir de un precio final. */
export function netoSinIva(precioFinal: number, alicuota: number): number {
  return precioFinal / (1 + alicuota / 100);
}
