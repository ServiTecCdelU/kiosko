// lib/consolidado.ts — agregacion del consolidado del dia (multi-caja).
// Logica pura, sin I/O: suma las cajas del dia y arma el detalle por cajero.

export interface CajaDelDia {
  id: string;
  estado: "abierta" | "cerrada";
  puestoNombre: string;
  cajeroNombre: string;
  totalEfectivo: number;
  totalTransferencia: number;
  totalMercadoPago: number;
  totalVentas: number;
  cantidadVentas: number;
  /** Solo cajas cerradas; una abierta todavia no tiene arqueo. */
  diferencia?: number;
}

export interface ConsolidadoTotales {
  totalEfectivo: number;
  totalTransferencia: number;
  totalMercadoPago: number;
  totalVentas: number;
  cantidadVentas: number;
  cajasAbiertas: number;
  cajasCerradas: number;
}

export interface DiferenciaPorCajero {
  cajeroNombre: string;
  cajasCerradas: number;
  /** Suma de diferencias de arqueo (negativo = falto plata). */
  diferencia: number;
}

export function consolidarDia(cajas: CajaDelDia[]): {
  totales: ConsolidadoTotales;
  porCajero: DiferenciaPorCajero[];
} {
  const totales: ConsolidadoTotales = {
    totalEfectivo: 0,
    totalTransferencia: 0,
    totalMercadoPago: 0,
    totalVentas: 0,
    cantidadVentas: 0,
    cajasAbiertas: 0,
    cajasCerradas: 0,
  };
  const porCajero = new Map<string, DiferenciaPorCajero>();

  for (const c of cajas) {
    totales.totalEfectivo += c.totalEfectivo;
    totales.totalTransferencia += c.totalTransferencia;
    totales.totalMercadoPago += c.totalMercadoPago;
    totales.totalVentas += c.totalVentas;
    totales.cantidadVentas += c.cantidadVentas;
    if (c.estado === "abierta") totales.cajasAbiertas += 1;
    else totales.cajasCerradas += 1;

    if (c.estado === "cerrada") {
      const nombre = c.cajeroNombre || "Sin identificar";
      const prev = porCajero.get(nombre) ?? { cajeroNombre: nombre, cajasCerradas: 0, diferencia: 0 };
      porCajero.set(nombre, {
        cajeroNombre: nombre,
        cajasCerradas: prev.cajasCerradas + 1,
        diferencia: prev.diferencia + (c.diferencia ?? 0),
      });
    }
  }

  // Primero los que mas plata les falto: es lo que el dueño quiere ver.
  const detalle = Array.from(porCajero.values()).sort((a, b) => a.diferencia - b.diferencia);
  return { totales, porCajero: detalle };
}
