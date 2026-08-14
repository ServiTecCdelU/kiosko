// lib/credito.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluarCredito } from "./credito.ts";

describe("evaluarCredito", () => {
  test("limite 0 significa SIN limite: nunca frena", () => {
    const r = evaluarCredito(500000, 0, 100000);
    assert.equal(r.supera, false);
    assert.equal(r.excedente, 0);
  });

  test("por debajo del limite deja pasar", () => {
    const r = evaluarCredito(2000, 10000, 3000);
    assert.equal(r.deudaProyectada, 5000);
    assert.equal(r.supera, false);
  });

  test("frena cuando la venta hace superar el limite", () => {
    const r = evaluarCredito(9000, 10000, 2000);
    assert.equal(r.deudaProyectada, 11000);
    assert.equal(r.supera, true);
    assert.equal(r.excedente, 1000);
  });

  test("justo en el limite NO frena (el limite es alcanzable)", () => {
    const r = evaluarCredito(7000, 10000, 3000);
    assert.equal(r.deudaProyectada, 10000);
    assert.equal(r.supera, false);
  });

  test("un peso por encima del limite frena", () => {
    const r = evaluarCredito(7000, 10000, 3001);
    assert.equal(r.supera, true);
    assert.equal(r.excedente, 1);
  });

  test("un cliente que YA esta pasado no puede llevar nada mas", () => {
    // El caso real de produccion: debia 199.999 con limite 10.000.
    const r = evaluarCredito(199999, 10000, 190);
    assert.equal(r.supera, true);
    assert.equal(r.excedente, 190189);
  });

  test("un cliente pasado tampoco pasa con una venta de cero", () => {
    const r = evaluarCredito(15000, 10000, 0);
    assert.equal(r.supera, true);
  });

  test("cliente nuevo sin deuda con una venta chica", () => {
    const r = evaluarCredito(0, 1000, 190);
    assert.equal(r.saldo, 0);
    assert.equal(r.deudaProyectada, 190);
    assert.equal(r.supera, false);
  });

  test("tolera valores nulos o indefinidos sin romper", () => {
    const r = evaluarCredito(null as any, undefined as any, NaN);
    assert.equal(r.saldo, 0);
    assert.equal(r.limite, 0);
    assert.equal(r.deudaProyectada, 0);
    assert.equal(r.supera, false);
  });

  test("tolera valores que llegan como string desde la base", () => {
    const r = evaluarCredito("9000" as any, "10000" as any, "2000" as any);
    assert.equal(r.deudaProyectada, 11000);
    assert.equal(r.supera, true);
  });

  test("un saldo a favor (negativo) suma capacidad de compra", () => {
    const r = evaluarCredito(-5000, 10000, 12000);
    assert.equal(r.deudaProyectada, 7000);
    assert.equal(r.supera, false);
  });
});
