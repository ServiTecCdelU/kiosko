// lib/aviso-pago.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { debeAvisarPago } from "./aviso-pago.ts";

describe("debeAvisarPago", () => {
  test("fuera de la ventana (antes del 7) no avisa aunque no haya pagado", () => {
    assert.equal(debeAvisarPago({ anio: 2026, mes: 5, dia: 6 }, null), false);
  });

  test("fuera de la ventana (despues del 10) no avisa", () => {
    assert.equal(debeAvisarPago({ anio: 2026, mes: 5, dia: 11 }, null), false);
  });

  test("dentro de la ventana (7 al 10) sin pago registrado avisa", () => {
    assert.equal(debeAvisarPago({ anio: 2026, mes: 5, dia: 7 }, null), true);
    assert.equal(debeAvisarPago({ anio: 2026, mes: 5, dia: 10 }, null), true);
  });

  test("dentro de la ventana pero ya pago este mes no avisa", () => {
    assert.equal(debeAvisarPago({ anio: 2026, mes: 5, dia: 8 }, "2026-05"), false);
  });

  test("dentro de la ventana con pago de un mes anterior si avisa", () => {
    assert.equal(debeAvisarPago({ anio: 2026, mes: 5, dia: 8 }, "2026-04"), true);
  });

  test("padding del mes en el string comparado", () => {
    assert.equal(debeAvisarPago({ anio: 2026, mes: 1, dia: 9 }, "2026-01"), false);
    assert.equal(debeAvisarPago({ anio: 2026, mes: 1, dia: 9 }, "2026-1"), true);
  });
});
