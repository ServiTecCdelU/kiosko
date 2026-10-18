// lib/presupuesto.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  errorValidez, estaVigente, estadoVisible, preciosPresupuestados, subtotalConPresupuesto, venceEl,
} from "./presupuesto.ts";

describe("venceEl", () => {
  test("suma dias cruzando de mes y de año", () => {
    assert.equal(venceEl("2026-10-18", 15), "2026-11-02");
    assert.equal(venceEl("2026-12-25", 10), "2027-01-04");
  });
});

describe("vigencia", () => {
  test("vale hasta el dia de vencimiento inclusive", () => {
    assert.equal(estaVigente("vigente", "2026-11-02", "2026-11-02"), true);
    assert.equal(estaVigente("vigente", "2026-11-02", "2026-11-03"), false);
    assert.equal(estaVigente("vendido", "2026-11-02", "2026-10-20"), false);
  });
  test("estado visible", () => {
    assert.equal(estadoVisible("vigente", "2026-11-02", "2026-11-03"), "vencido");
    assert.equal(estadoVisible("vigente", "2026-11-02", "2026-10-20"), "vigente");
    assert.equal(estadoVisible("anulado", "2026-11-02", "2026-10-20"), "anulado");
  });
});

describe("precio respetado", () => {
  const items = [
    { productId: "a", name: "Tornillo", quantity: 150, price: 45, subtotal: 6750 },
    { productId: "b", name: "Cable", quantity: 1.481, price: 1350, subtotal: 1999.35 },
  ];
  const precios = preciosPresupuestados(items);

  test("si aumento, se cobra lo presupuestado", () => {
    assert.equal(subtotalConPresupuesto(150 * 50, precios.get("a"), 150), 6750);
  });
  test("si bajo, se cobra lo de hoy", () => {
    assert.equal(subtotalConPresupuesto(150 * 40, precios.get("a"), 150), 6000);
  });
  test("vale aunque cambie la cantidad", () => {
    assert.equal(subtotalConPresupuesto(200 * 50, precios.get("a"), 200), 9000);
  });
  test("producto que no estaba en el presupuesto: precio de hoy", () => {
    assert.equal(subtotalConPresupuesto(1234, precios.get("z"), 1), 1234);
  });
  test("fraccionable: precio por unidad a partir del subtotal", () => {
    assert.equal(subtotalConPresupuesto(2 * 1500, precios.get("b"), 2), 2700);
  });
});

test("errorValidez", () => {
  assert.equal(errorValidez(15), null);
  assert.ok(errorValidez(0));
  assert.ok(errorValidez(400));
  assert.ok(errorValidez(2.5));
});
