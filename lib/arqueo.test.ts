// lib/arqueo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { agregarResumenCaja } from "./arqueo.ts";

const sinMovimientos: never[] = [];

describe("agregarResumenCaja — medios de pago", () => {
  test("una caja vacia da todo en cero", () => {
    const r = agregarResumenCaja([], []);
    assert.deepEqual(r, {
      totalEfectivo: 0,
      totalTransferencia: 0,
      totalMercadoPago: 0,
      totalVentas: 0,
      cantidadVentas: 0,
      totalRetiros: 0,
      totalAportes: 0,
      totalGastos: 0,
    });
  });

  test("el efectivo suma al total de efectivo", () => {
    const r = agregarResumenCaja([{ total: 1500, payment_method: "efectivo" }], sinMovimientos);
    assert.equal(r.totalEfectivo, 1500);
    assert.equal(r.totalTransferencia, 0);
  });

  test("la transferencia no cuenta como efectivo", () => {
    const r = agregarResumenCaja([{ total: 2000, payment_method: "transferencia" }], sinMovimientos);
    assert.equal(r.totalEfectivo, 0);
    assert.equal(r.totalTransferencia, 2000);
  });

  test("Mercado Pago va en su propio total, no en transferencia", () => {
    const r = agregarResumenCaja(
      [
        { total: 1000, payment_method: "mercadopago" },
        { total: 500, payment_method: "mercadopago_point" },
      ],
      sinMovimientos,
    );
    assert.equal(r.totalMercadoPago, 1500);
    assert.equal(r.totalTransferencia, 0);
    assert.equal(r.totalEfectivo, 0);
  });

  test("'tarjeta' (historico) se sigue contando como transferencia", () => {
    const r = agregarResumenCaja([{ total: 800, payment_method: "tarjeta" }], sinMovimientos);
    assert.equal(r.totalTransferencia, 800);
  });

  test("EL FIADO NO MUEVE LA CAJA: no suma a ningun total de dinero", () => {
    const r = agregarResumenCaja([{ total: 5000, payment_method: "fiado" }], sinMovimientos);
    assert.equal(r.totalEfectivo, 0);
    assert.equal(r.totalTransferencia, 0);
    assert.equal(r.totalMercadoPago, 0);
    assert.equal(r.totalVentas, 0);
  });

  test("el fiado igual cuenta para la cantidad de ventas", () => {
    const r = agregarResumenCaja(
      [
        { total: 5000, payment_method: "fiado" },
        { total: 100, payment_method: "efectivo" },
      ],
      sinMovimientos,
    );
    assert.equal(r.cantidadVentas, 2);
    assert.equal(r.totalVentas, 100);
  });
});

describe("agregarResumenCaja — venta mixta", () => {
  test("divide entre la porcion transferida y el resto en efectivo", () => {
    const r = agregarResumenCaja(
      [{ total: 1000, payment_method: "mixto", transfer_amount: 400 }],
      sinMovimientos,
    );
    assert.equal(r.totalTransferencia, 400);
    assert.equal(r.totalEfectivo, 600);
    assert.equal(r.totalVentas, 1000);
  });

  test("sin transfer_amount, la mixta se toma como todo efectivo", () => {
    const r = agregarResumenCaja([{ total: 1000, payment_method: "mixto" }], sinMovimientos);
    assert.equal(r.totalEfectivo, 1000);
    assert.equal(r.totalTransferencia, 0);
  });

  test("una porcion transferida mayor al total no genera efectivo negativo", () => {
    const r = agregarResumenCaja(
      [{ total: 1000, payment_method: "mixto", transfer_amount: 5000 }],
      sinMovimientos,
    );
    assert.equal(r.totalTransferencia, 1000);
    assert.equal(r.totalEfectivo, 0);
  });
});

describe("agregarResumenCaja — movimientos de caja", () => {
  test("separa retiros, aportes y gastos", () => {
    const r = agregarResumenCaja(sinMovimientos, [
      { tipo: "retiro", monto: 500 },
      { tipo: "retiro", monto: 200 },
      { tipo: "aporte", monto: 1000 },
      { tipo: "gasto", monto: 300 },
    ]);
    assert.equal(r.totalRetiros, 700);
    assert.equal(r.totalAportes, 1000);
    assert.equal(r.totalGastos, 300);
  });

  test("los movimientos no alteran el total vendido", () => {
    const r = agregarResumenCaja(
      [{ total: 1000, payment_method: "efectivo" }],
      [{ tipo: "aporte", monto: 9999 }],
    );
    assert.equal(r.totalVentas, 1000);
  });
});

describe("agregarResumenCaja — datos sucios", () => {
  test("tolera montos que vienen como string (numeric de Postgres)", () => {
    const r = agregarResumenCaja(
      [{ total: "1500.50", payment_method: "efectivo" }],
      [{ tipo: "retiro", monto: "100.25" }],
    );
    assert.equal(r.totalEfectivo, 1500.5);
    assert.equal(r.totalRetiros, 100.25);
  });

  test("un metodo de pago desconocido se toma como efectivo, no se pierde", () => {
    const r = agregarResumenCaja([{ total: 700, payment_method: "vale_carniceria" }], sinMovimientos);
    assert.equal(r.totalEfectivo, 700);
    assert.equal(r.totalVentas, 700);
  });

  test("un total nulo no rompe el arqueo", () => {
    const r = agregarResumenCaja(
      [{ total: null as any, payment_method: "efectivo" }],
      sinMovimientos,
    );
    assert.equal(r.totalEfectivo, 0);
  });
});

describe("agregarResumenCaja — caja de un dia completo", () => {
  test("el total vendido es la suma de los tres medios", () => {
    const r = agregarResumenCaja(
      [
        { total: 1000, payment_method: "efectivo" },
        { total: 2000, payment_method: "transferencia" },
        { total: 1500, payment_method: "mercadopago_point" },
        { total: 800, payment_method: "mixto", transfer_amount: 300 },
        { total: 4000, payment_method: "fiado" },
      ],
      [
        { tipo: "aporte", monto: 500 },
        { tipo: "retiro", monto: 200 },
        { tipo: "gasto", monto: 150 },
      ],
    );

    assert.equal(r.totalEfectivo, 1500); // 1000 + 500 de la mixta
    assert.equal(r.totalTransferencia, 2300); // 2000 + 300 de la mixta
    assert.equal(r.totalMercadoPago, 1500);
    assert.equal(r.totalVentas, 5300); // el fiado queda afuera
    assert.equal(r.cantidadVentas, 5);

    // Arqueo esperado, tal como lo calcula /api/caja al cerrar:
    // apertura + efectivo + aportes − retiros − gastos
    const apertura = 2000;
    const esperado =
      apertura + r.totalEfectivo + r.totalAportes - r.totalRetiros - r.totalGastos;
    assert.equal(esperado, 3650);
  });
});
