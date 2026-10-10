// lib/inventario.ts — recuento fisico: logica pura de la pantalla
// (progreso, diferencias, resumen). La base la ajusta la RPC cerrar_inventario_kiosko.

export interface ItemInventario {
  productoId: string;
  nombre: string;
  codigoBarras?: string;
  categoria?: string;
  stockSistema: number;
  contado?: number;
  /** Costo unitario vigente (precio_base), si se conoce. */
  costo?: number;
}

export interface ProgresoInventario {
  total: number;
  contados: number;
  pendientes: number;
  porcentaje: number;
}

export function progresoInventario(items: ItemInventario[]): ProgresoInventario {
  const total = items.length;
  const contados = items.filter((i) => i.contado != null).length;
  return {
    total,
    contados,
    pendientes: total - contados,
    porcentaje: total > 0 ? Math.round((contados / total) * 100) : 0,
  };
}

/** contado - sistema; null si no se conto. */
export function diferenciaItem(item: ItemInventario): number | null {
  if (item.contado == null) return null;
  return Math.round((item.contado - item.stockSistema) * 1000) / 1000;
}

export interface ResumenDiferencias {
  conDiferencia: number;
  faltantes: number;      // items con menos de lo que decia el sistema
  sobrantes: number;
  unidadesFaltantes: number;
  unidadesSobrantes: number;
  /** Valor a costo de faltantes (negativo) + sobrantes (positivo). */
  valor: number;
  sinCosto: number;       // items con diferencia pero sin costo cargado
}

export function resumenDiferencias(items: ItemInventario[]): ResumenDiferencias {
  const r: ResumenDiferencias = {
    conDiferencia: 0, faltantes: 0, sobrantes: 0, unidadesFaltantes: 0, unidadesSobrantes: 0, valor: 0, sinCosto: 0,
  };
  for (const it of items) {
    const d = diferenciaItem(it);
    if (d == null || d === 0) continue;
    r.conDiferencia++;
    if (d < 0) {
      r.faltantes++;
      r.unidadesFaltantes += -d;
    } else {
      r.sobrantes++;
      r.unidadesSobrantes += d;
    }
    if (it.costo == null) r.sinCosto++;
    else r.valor += d * it.costo;
  }
  r.valor = Math.round(r.valor * 100) / 100;
  return r;
}

/** Busca por codigo de barras exacto o por texto en el nombre (para el lector y el buscador). */
export function buscarEnInventario(items: ItemInventario[], texto: string, limite = 30): ItemInventario[] {
  const t = texto.trim().toLowerCase();
  if (!t) return items.slice(0, limite);
  const porCodigo = items.filter((i) => i.codigoBarras && i.codigoBarras.toLowerCase() === t);
  if (porCodigo.length > 0) return porCodigo;
  return items.filter((i) => i.nombre.toLowerCase().includes(t)).slice(0, limite);
}

/** Orden de trabajo: pendientes primero, despues por nombre. */
export function ordenarParaContar(items: ItemInventario[]): ItemInventario[] {
  return [...items].sort((a, b) => {
    const pa = a.contado == null ? 0 : 1;
    const pb = b.contado == null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}
