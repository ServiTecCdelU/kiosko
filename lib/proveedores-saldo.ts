// lib/proveedores-saldo.ts — cuenta corriente de proveedores, logica pura.
// Misma regla que la RPC registrar_pago_proveedor (44): un pago "a cuenta" se
// reparte a las compras con saldo mas viejas primero. Se usa para la vista
// previa en pantalla y para los resumenes.

export interface CompraConSaldo {
  id: string;
  proveedorId: string;
  total: number;
  pagado: number;
  /** ISO o Date: se usa solo para ordenar (mas vieja primero). */
  createdAt: Date | string;
  /** Fecha pactada de pago (YYYY-MM-DD) si la hay. */
  vence?: string;
}

export interface Aplicacion {
  compraId: string;
  monto: number;
}

const EPS = 0.009;

export function saldoCompra(c: Pick<CompraConSaldo, "total" | "pagado">): number {
  return Math.max(0, (Number(c.total) || 0) - (Number(c.pagado) || 0));
}

export function tieneSaldo(c: Pick<CompraConSaldo, "total" | "pagado">): boolean {
  return saldoCompra(c) > EPS;
}

/** Compras con saldo, de la mas vieja a la mas nueva. */
export function comprasPendientes(compras: CompraConSaldo[]): CompraConSaldo[] {
  return compras
    .filter(tieneSaldo)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Reparte un pago a cuenta entre las compras pendientes (FIFO). */
export function repartirPago(monto: number, compras: CompraConSaldo[]): Aplicacion[] {
  let restante = Math.max(0, Number(monto) || 0);
  const out: Aplicacion[] = [];
  for (const c of comprasPendientes(compras)) {
    if (restante <= EPS) break;
    const parte = Math.min(restante, saldoCompra(c));
    out.push({ compraId: c.id, monto: Math.round(parte * 100) / 100 });
    restante -= parte;
  }
  return out;
}

export function deudaTotal(compras: CompraConSaldo[]): number {
  return compras.reduce((s, c) => s + saldoCompra(c), 0);
}

export interface SaldoProveedor {
  proveedorId: string;
  saldo: number;
  compras: number;
  /** La compra pendiente mas vieja (ISO), para saber hace cuanto se debe. */
  desde?: string;
  /** La fecha pactada mas proxima entre las pendientes. */
  proximoVencimiento?: string;
}

/** Deuda por proveedor a partir de las compras con saldo. */
export function resumenSaldos(compras: CompraConSaldo[]): SaldoProveedor[] {
  const porProv = new Map<string, SaldoProveedor>();
  for (const c of comprasPendientes(compras)) {
    const prev = porProv.get(c.proveedorId) ?? { proveedorId: c.proveedorId, saldo: 0, compras: 0 };
    prev.saldo += saldoCompra(c);
    prev.compras += 1;
    const iso = new Date(c.createdAt).toISOString();
    if (!prev.desde || iso < prev.desde) prev.desde = iso;
    if (c.vence && (!prev.proximoVencimiento || c.vence < prev.proximoVencimiento)) prev.proximoVencimiento = c.vence;
    porProv.set(c.proveedorId, prev);
  }
  return Array.from(porProv.values()).sort((a, b) => b.saldo - a.saldo);
}

/** Mensaje de error de un pago, o null si es valido. */
export function errorPago(monto: number, compras: CompraConSaldo[], compraId?: string): string | null {
  if (!Number.isFinite(monto) || monto <= 0) return "El monto debe ser mayor a cero";
  if (compraId) {
    const c = compras.find((x) => x.id === compraId);
    if (!c) return "La compra no existe";
    if (monto > saldoCompra(c) + EPS) return "El pago supera el saldo de esa compra";
    return null;
  }
  if (monto > deudaTotal(compras) + EPS) return "El pago supera lo que se le debe al proveedor";
  return null;
}
