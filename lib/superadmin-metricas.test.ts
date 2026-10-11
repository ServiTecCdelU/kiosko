// lib/superadmin-metricas.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcularMetricas, etiquetaDe, pendiente, periodoDe, sumarMeses,
  type ComercioM, type EventoM, type PagoM,
} from "./superadmin-metricas.ts";

const AHORA = new Date("2026-10-10T15:00:00Z");
const PRECIOS = { free: 0, basico: 30000, pro: 60000 };

function comercio(p: Partial<ComercioM> & { id: string; created_at: string }): ComercioM {
  return { estado: "prueba", plan: "free", trial_hasta: null, origen: "autoregistro", rubro: null, ...p };
}

function pago(comercio_id: string, fecha: string, plan = "basico", monto = 30000): PagoM {
  return { comercio_id, plan, monto, fecha, metodo: "manual" };
}

describe("helpers de periodos", () => {
  test("periodoDe usa la hora argentina", () => {
    // 01:00 UTC del 1 de noviembre es todavia 31 de octubre en Argentina
    assert.equal(periodoDe("2026-11-01T01:00:00Z"), "2026-10");
    assert.equal(periodoDe("2026-11-01T04:00:00Z"), "2026-11");
  });

  test("sumarMeses cruza el año en los dos sentidos", () => {
    assert.equal(sumarMeses("2026-10", 3), "2027-01");
    assert.equal(sumarMeses("2026-01", -1), "2025-12");
    assert.equal(etiquetaDe("2027-01"), "ene 27");
  });

  test("pendiente de una serie lineal y de una constante", () => {
    assert.equal(pendiente([1, 2, 3, 4]), 1);
    assert.equal(pendiente([5, 5, 5]), 0);
    assert.equal(pendiente([7]), 0);
  });
});

describe("calcularMetricas", () => {
  const comercios: ComercioM[] = [
    comercio({ id: "a", created_at: "2026-07-05T12:00:00Z", estado: "activo", plan: "pro" }),
    comercio({ id: "b", created_at: "2026-08-10T12:00:00Z", estado: "activo", plan: "basico" }),
    comercio({ id: "c", created_at: "2026-08-20T12:00:00Z", estado: "baja", plan: "free", origen: null }),
    comercio({ id: "d", created_at: "2026-09-15T12:00:00Z", estado: "prueba", plan: "free", trial_hasta: "2026-09-29T12:00:00Z" }),
    comercio({ id: "e", created_at: "2026-10-03T12:00:00Z", estado: "prueba", plan: "free", trial_hasta: "2026-10-17T12:00:00Z", rubro: "kiosco" }),
  ];
  const pagos: PagoM[] = [
    pago("a", "2026-07-20T12:00:00Z", "basico"),
    pago("a", "2026-08-20T12:00:00Z", "pro", 60000),
    pago("a", "2026-09-20T12:00:00Z", "pro", 60000),
    pago("b", "2026-08-25T12:00:00Z"),
    pago("b", "2026-09-25T12:00:00Z"),
  ];

  test("altas por mes, origen y cohortes", () => {
    const m = calcularMetricas({ comercios, pagos, debitos: [], eventos: null, precios: PRECIOS, ahora: AHORA, meses: 4 });
    assert.deepEqual(m.meses.map((x) => x.periodo), ["2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(m.meses.map((x) => x.altas), [1, 2, 1, 1]);
    assert.equal(m.meses[1].altasAuto, 1);
    assert.equal(m.meses[1].altasManual, 1);
    const ago = m.cohortes.find((c) => c.periodo === "2026-08")!;
    assert.equal(ago.total, 2);
    assert.equal(ago.baja, 1);
    assert.equal(ago.pagaron, 1);
  });

  test("ingresos cobrados por mes y primeros pagos", () => {
    const m = calcularMetricas({ comercios, pagos, debitos: [], eventos: null, precios: PRECIOS, ahora: AHORA, meses: 4 });
    assert.deepEqual(m.meses.map((x) => x.ingresos), [30000, 90000, 90000, 0]);
    assert.deepEqual(m.meses.map((x) => x.primerosPagos), [1, 1, 0, 0]);
  });

  test("sin eventos, el paso a Pro se infiere del primer pago en Pro", () => {
    const m = calcularMetricas({ comercios, pagos, debitos: [], eventos: null, precios: PRECIOS, ahora: AHORA, meses: 4 });
    assert.equal(m.conEventos, false);
    assert.deepEqual(m.meses.map((x) => x.pasaronAPro), [0, 1, 0, 0]);
    assert.equal(m.tasas.diasHastaPro, 46);
  });

  test("con eventos, bajas y pasajes a Pro salen del historial y el estado se reconstruye", () => {
    const eventos: EventoM[] = [
      { comercio_id: "a", tipo: "plan", de: "basico", a: "pro", created_at: "2026-08-18T12:00:00Z" },
      { comercio_id: "c", tipo: "estado", de: "prueba", a: "baja", created_at: "2026-09-10T12:00:00Z" },
    ];
    const m = calcularMetricas({ comercios, pagos, debitos: [], eventos, precios: PRECIOS, ahora: AHORA, meses: 4 });
    assert.equal(m.conEventos, true);
    assert.deepEqual(m.meses.map((x) => x.bajas), [0, 0, 1, 0]);
    assert.deepEqual(m.meses.map((x) => x.pasaronAPro), [0, 1, 0, 0]);
    // "c" estaba en uso al cerrar agosto (se dio de baja en septiembre)
    assert.equal(m.meses[1].enUso, 3);
    assert.equal(m.meses[2].enUso, 3);
    // "a" pagaba Basico al cerrar julio (paso a Pro en agosto)
    assert.equal(m.meses[0].pagando, 1);
  });

  test("tasas: conversion, pro, mrr y arpu", () => {
    const m = calcularMetricas({ comercios, pagos, debitos: [], eventos: null, precios: PRECIOS, ahora: AHORA, meses: 4 });
    // Terminaron la prueba: a, b, c, d (e sigue en prueba). Pagaron o estan activos: a, b.
    assert.equal(m.tasas.elegiblesConversion, 4);
    assert.equal(m.tasas.conversionPct, 50);
    assert.equal(m.tasas.pagando, 2);
    assert.equal(m.tasas.proPct, 50);
    assert.equal(m.tasas.mrr, 90000);
    assert.equal(m.tasas.arpu, 45000);
    assert.deepEqual(m.funnel, { registrados: 5, terminaronPrueba: 4, pagaron: 2, pro: 1, conDebito: 0 });
  });

  test("debito automatico: activados y cancelados por mes y % de adopcion", () => {
    const debitos = [
      { comercio_id: "a", estado: "authorized", created_at: "2026-09-01T12:00:00Z", cancelado_at: null },
      { comercio_id: "b", estado: "cancelled", created_at: "2026-08-28T12:00:00Z", cancelado_at: "2026-10-02T12:00:00Z" },
    ];
    const m = calcularMetricas({ comercios, pagos, debitos, eventos: null, precios: PRECIOS, ahora: AHORA, meses: 4 });
    assert.deepEqual(m.meses.map((x) => x.debitosActivados), [0, 1, 1, 0]);
    assert.deepEqual(m.meses.map((x) => x.debitosCancelados), [0, 0, 0, 1]);
    assert.equal(m.tasas.debitoPct, 50);
    assert.equal(m.funnel.conDebito, 1);
  });

  test("la proyeccion nunca es negativa y el optimista no baja del conservador", () => {
    const m = calcularMetricas({ comercios, pagos, debitos: [], eventos: null, precios: PRECIOS, ahora: AHORA, meses: 4, horizonte: 6 });
    assert.equal(m.proyeccion.length, 6);
    assert.equal(m.proyeccion[0].periodo, "2026-11");
    for (const p of m.proyeccion) {
      assert.ok(p.altas >= 0);
      assert.ok(p.pagando.conservador >= 0);
      assert.ok(p.pagando.optimista >= p.pagando.esperado);
      assert.ok(p.pagando.esperado >= p.pagando.conservador);
      assert.ok(p.ingresos.esperado >= 0);
    }
  });

  test("sin comercios no explota", () => {
    const m = calcularMetricas({ comercios: [], pagos: [], debitos: [], eventos: null, precios: PRECIOS, ahora: AHORA });
    assert.equal(m.meses.length, 12);
    assert.equal(m.tasas.conversionPct, 0);
    assert.equal(m.tasas.churnMensualPct, 0);
    assert.equal(m.proyeccion.every((p) => p.ingresos.esperado === 0), true);
  });
});
