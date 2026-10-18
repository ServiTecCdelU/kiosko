// lib/escaneo-stock.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { esCodigoDelProducto, leerEntradaCantidad, nombreSugerido } from "./escaneo-stock.ts";

describe("leerEntradaCantidad", () => {
  test("cantidades tipeadas", () => {
    assert.deepEqual(leerEntradaCantidad("12", "1", true), { tipo: "cantidad", valor: 12 });
    assert.deepEqual(leerEntradaCantidad("2,5", "1", false), { tipo: "cantidad", valor: 2.5 });
    assert.deepEqual(leerEntradaCantidad("1.5", "", true), { tipo: "invalida" });
    assert.deepEqual(leerEntradaCantidad("0", "", true), { tipo: "invalida" });
    assert.deepEqual(leerEntradaCantidad("abc", "", true), { tipo: "invalida" });
  });
  test("el lector escanea encima de la cantidad: es un codigo, no 17790895000997 unidades", () => {
    assert.deepEqual(leerEntradaCantidad("17790895000997", "1", true), { tipo: "codigo", codigo: "7790895000997" });
    assert.deepEqual(leerEntradaCantidad("247790895000997", "24", true), { tipo: "codigo", codigo: "7790895000997" });
    assert.deepEqual(leerEntradaCantidad("7790895000997", "", true), { tipo: "codigo", codigo: "7790895000997" });
  });
  test("un numero grande que no es codigo no pasa", () => {
    assert.deepEqual(leerEntradaCantidad("150000", "", true), { tipo: "invalida" });
  });
});

test("esCodigoDelProducto", () => {
  const p = { codigo: "105", codigoBarras: "7790895000997" };
  assert.equal(esCodigoDelProducto("7790895000997", p), true);
  assert.equal(esCodigoDelProducto(" 105 ", p), true);
  assert.equal(esCodigoDelProducto("7790895000998", p), false);
  assert.equal(esCodigoDelProducto("", p), false);
});

test("nombreSugerido desde Open Food Facts", () => {
  assert.equal(nombreSugerido({ product_name: "coca cola", brands: "Coca-Cola", quantity: "2.25 L" }), "Coca-Cola coca cola 2,25 L");
  assert.equal(nombreSugerido({ product_name: "Polenta Instantánea", brands: "Presto Pronta, Arcor", quantity: "500 g" }), "Presto Pronta Polenta Instantánea 500 g");
  assert.equal(nombreSugerido({ product_name: "Oreo 118 g", brands: "Oreo", quantity: "118 g" }), "Oreo 118 g");
  assert.equal(nombreSugerido({ product_name: "  ", brands: "X" }), null);
});
