// lib/credito.ts — regla del limite de credito para las ventas fiadas.
// Puro (sin React). Espeja lo que valida process_sale_kiosko en la base: la
// RPC es la autoridad, esto sirve para avisar en el POS antes de confirmar.
// Si cambia una, tiene que cambiar la otra.

export interface EstadoCredito {
  /** Cuanto debe hoy el cliente. */
  saldo: number;
  /** Deuda que quedaria con esta venta. */
  deudaProyectada: number;
  /** 0 = sin limite. */
  limite: number;
  supera: boolean;
  /** Cuanto se pasa del limite (0 si no se pasa). */
  excedente: number;
}

/**
 * Un limite en 0 significa "sin limite", que es el comportamiento historico
 * del sistema: los clientes creados sin limite pueden seguir comprando.
 */
export function evaluarCredito(saldo: number, limite: number, totalVenta: number): EstadoCredito {
  const saldoActual = Number(saldo) || 0;
  const limiteNum = Number(limite) || 0;
  const total = Number(totalVenta) || 0;
  const deudaProyectada = saldoActual + total;

  const supera = limiteNum > 0 && deudaProyectada > limiteNum;

  return {
    saldo: saldoActual,
    deudaProyectada,
    limite: limiteNum,
    supera,
    excedente: supera ? deudaProyectada - limiteNum : 0,
  };
}
