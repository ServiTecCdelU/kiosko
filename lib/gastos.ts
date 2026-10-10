// lib/gastos.ts — categorias de los gastos de caja (migracion 44) y su agrupado
// para el reporte. Logica pura.

export type GastoCategoria = "mercaderia" | "servicios" | "alquiler" | "sueldos" | "impuestos" | "otros";

export const CATEGORIAS_GASTO: { value: GastoCategoria; label: string; ayuda: string }[] = [
  { value: "mercaderia", label: "Mercadería", ayuda: "Pagos a proveedores y reparto" },
  { value: "servicios", label: "Servicios", ayuda: "Luz, gas, internet, teléfono" },
  { value: "alquiler", label: "Alquiler", ayuda: "Local y expensas" },
  { value: "sueldos", label: "Sueldos", ayuda: "Empleados y adelantos" },
  { value: "impuestos", label: "Impuestos", ayuda: "Monotributo, ingresos brutos, tasas" },
  { value: "otros", label: "Otros", ayuda: "Lo que no entra en las demás" },
];

export const SIN_CATEGORIA = "Sin categoría";

export function labelCategoriaGasto(categoria: string | null | undefined): string {
  return CATEGORIAS_GASTO.find((c) => c.value === categoria)?.label ?? SIN_CATEGORIA;
}

export function esCategoriaGasto(valor: unknown): valor is GastoCategoria {
  return CATEGORIAS_GASTO.some((c) => c.value === valor);
}

export interface GastoMinimo {
  monto: number | string;
  categoria?: string | null;
}

export interface GastoPorCategoria {
  categoria: string;
  label: string;
  total: number;
  cantidad: number;
}

/** Agrupa por categoria (los viejos sin categoria van a "Sin categoría"), de mayor a menor. */
export function agruparGastos(gastos: GastoMinimo[]): GastoPorCategoria[] {
  const m = new Map<string, GastoPorCategoria>();
  for (const g of gastos) {
    const key = esCategoriaGasto(g.categoria) ? g.categoria : "";
    const prev = m.get(key) ?? { categoria: key, label: labelCategoriaGasto(key), total: 0, cantidad: 0 };
    prev.total += Number(g.monto) || 0;
    prev.cantidad += 1;
    m.set(key, prev);
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}
