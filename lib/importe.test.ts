// lib/importe.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cantidadDesdeImporte } from "./importe.ts";

describe("cantidadDesdeImporte", () => {
  test("$2.000 de almendras a $8.000/kg son 250 g exactos", () => {
    assert.equal(cantidadDesdeImporte(2000, 8000), 0.25);
  });

  test("nunca se cobra mas de lo pedido (redondea al gramo hacia abajo)", () => {
    const kg = cantidadDesdeImporte(2000, 8450)!;
    assert.equal(kg, 0.236);
    assert.ok(Math.round(kg * 8450 * 100) / 100 <= 2000);
  });

  test("division exacta no pierde un gramo por coma flotante", () => {
    assert.equal(cantidadDesdeImporte(1000, 2000), 0.5);
    assert.equal(cantidadDesdeImporte(300, 1000), 0.3);
  });

  test("sin precio o importe que no llega a un gramo: null", () => {
    assert.equal(cantidadDesdeImporte(2000, 0), null);
    assert.equal(cantidadDesdeImporte(1, 5000), null);
  });
});
