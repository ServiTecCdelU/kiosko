// lib/compras.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { subtotalItem, totalCompra, margenPct } from "./compras.ts";

describe("totalCompra", () => {
  test("sin items da cero", () => {
    assert.equal(totalCompra([]), 0);
  });

  test("suma subtotales, incluyendo cantidades con decimales (pesables)", () => {
    const items = [
      { cantidad: 2, costoUnitario: 500 },
      { cantidad: 3.5, costoUnitario: 1000 },
    ];
    assert.equal(subtotalItem(items[0]), 1000);
    assert.equal(subtotalItem(items[1]), 3500);
    assert.equal(totalCompra(items), 4500);
  });

  test("costo cero (bonificacion) es valido", () => {
    assert.equal(totalCompra([{ cantidad: 5, costoUnitario: 0 }]), 0);
  });
});

describe("margenPct", () => {
  test("margen normal: venta 1000, costo 600 → 40%", () => {
    assert.equal(margenPct(1000, 600), 40);
  });

  test("costo mayor que venta da margen negativo", () => {
    assert.equal(margenPct(1000, 1200), -20);
  });

  test("sin precio de venta devuelve null", () => {
    assert.equal(margenPct(0, 500), null);
    assert.equal(margenPct(NaN, 500), null);
  });
});
