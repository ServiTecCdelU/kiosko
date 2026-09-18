// lib/consolidado.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { consolidarDia, type CajaDelDia } from "./consolidado.ts";

function caja(parcial: Partial<CajaDelDia>): CajaDelDia {
  return {
    id: "caja_x",
    estado: "cerrada",
    puestoNombre: "Caja 1",
    cajeroNombre: "Ana",
    totalEfectivo: 0,
    totalTransferencia: 0,
    totalMercadoPago: 0,
    totalVentas: 0,
    cantidadVentas: 0,
    diferencia: 0,
    ...parcial,
  };
}

describe("consolidarDia — totales", () => {
  test("sin cajas da todo en cero", () => {
    const { totales, porCajero } = consolidarDia([]);
    assert.deepEqual(totales, {
      totalEfectivo: 0,
      totalTransferencia: 0,
      totalMercadoPago: 0,
      totalVentas: 0,
      cantidadVentas: 0,
      cajasAbiertas: 0,
      cajasCerradas: 0,
    });
    assert.deepEqual(porCajero, []);
  });

  test("suma abiertas y cerradas por separado y los medios de pago juntos", () => {
    const { totales } = consolidarDia([
      caja({ estado: "abierta", totalEfectivo: 1000, totalMercadoPago: 500, totalVentas: 1500, cantidadVentas: 3, diferencia: undefined }),
      caja({ estado: "cerrada", totalEfectivo: 2000, totalTransferencia: 300, totalVentas: 2300, cantidadVentas: 5 }),
    ]);
    assert.equal(totales.totalEfectivo, 3000);
    assert.equal(totales.totalTransferencia, 300);
    assert.equal(totales.totalMercadoPago, 500);
    assert.equal(totales.totalVentas, 3800);
    assert.equal(totales.cantidadVentas, 8);
    assert.equal(totales.cajasAbiertas, 1);
    assert.equal(totales.cajasCerradas, 1);
  });
});

describe("consolidarDia — diferencias por cajero", () => {
  test("solo las cajas cerradas cuentan para la diferencia", () => {
    const { porCajero } = consolidarDia([
      caja({ estado: "abierta", cajeroNombre: "Ana", diferencia: undefined }),
      caja({ estado: "cerrada", cajeroNombre: "Beto", diferencia: -500 }),
    ]);
    assert.deepEqual(porCajero, [{ cajeroNombre: "Beto", cajasCerradas: 1, diferencia: -500 }]);
  });

  test("acumula varias cajas del mismo cajero y ordena por faltante", () => {
    const { porCajero } = consolidarDia([
      caja({ estado: "cerrada", cajeroNombre: "Ana", diferencia: 100 }),
      caja({ estado: "cerrada", cajeroNombre: "Beto", diferencia: -200 }),
      caja({ estado: "cerrada", cajeroNombre: "Beto", diferencia: -300 }),
    ]);
    assert.deepEqual(porCajero, [
      { cajeroNombre: "Beto", cajasCerradas: 2, diferencia: -500 },
      { cajeroNombre: "Ana", cajasCerradas: 1, diferencia: 100 },
    ]);
  });

  test("cajero sin nombre queda como Sin identificar", () => {
    const { porCajero } = consolidarDia([caja({ estado: "cerrada", cajeroNombre: "", diferencia: 0 })]);
    assert.equal(porCajero[0].cajeroNombre, "Sin identificar");
  });
});
