// lib/venta-validacion.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { errorCantidad, errorDescuento, errorPrecioLibre, ERROR_SIN_CAJA } from "./venta-validacion.ts";
import { esErrorDeCaja } from "./offline/cola.ts";

describe("errorCantidad", () => {
  test("por unidad solo enteros", () => {
    assert.equal(errorCantidad(3, "un", "Medialuna"), null);
    assert.ok(errorCantidad(1.5, "un", "Medialuna"));
    assert.ok(errorCantidad(3.5, undefined, "Cable"));
  });

  test("por kg acepta gramos y rechaza mas decimales", () => {
    assert.equal(errorCantidad(0.355, "kg", "Queso"), null);
    assert.equal(errorCantidad(1, "kg", "Pan"), null);
    assert.ok(errorCantidad(0.3555, "kg", "Queso"));
  });

  test("cero, negativo o no numerico no sirven", () => {
    assert.ok(errorCantidad(0, "un", "x"));
    assert.ok(errorCantidad(-1, "kg", "x"));
    assert.ok(errorCantidad(NaN, "un", "x"));
  });
});

describe("errorPrecioLibre", () => {
  test("importe positivo en centavos pasa", () => {
    assert.equal(errorPrecioLibre(5000, "Recarga SUBE"), null);
    assert.equal(errorPrecioLibre(350.5, "Fotocopias"), null);
  });
  test("sin importe, con mas de 2 decimales o por encima del tope, no", () => {
    assert.ok(errorPrecioLibre(0, "Varios"));
    assert.ok(errorPrecioLibre(NaN, "Varios"));
    assert.ok(errorPrecioLibre(10.005, "Varios"));
    assert.ok(errorPrecioLibre(5_000_000, "Varios"));
  });
});

describe("errorDescuento", () => {
  test("hasta el total pasa; mas que el total o negativo, no", () => {
    assert.equal(errorDescuento(0, 1000), null);
    assert.equal(errorDescuento(1000, 1000), null);
    assert.ok(errorDescuento(1500, 1000));
    assert.ok(errorDescuento(-10, 1000));
  });
});

test("la falta de caja la reconoce la cola offline (para pasarla a la caja actual)", () => {
  assert.equal(esErrorDeCaja(ERROR_SIN_CAJA), true);
});
