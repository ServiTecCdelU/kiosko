// lib/cantidad.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ajustarCantidad, cantidadTexto, parseCantidad, separarMultiplicador } from "./cantidad.ts";

describe("cantidadTexto", () => {
  test("kg con 3 decimales y coma; unidad tal cual", () => {
    assert.equal(cantidadTexto(0.355, "kg"), "0,355kg");
    assert.equal(cantidadTexto(3, "un"), "3");
  });
});

describe("parseCantidad", () => {
  test("acepta coma o punto", () => {
    assert.equal(parseCantidad("1,5"), 1.5);
    assert.equal(parseCantidad("0.355"), 0.355);
    assert.equal(parseCantidad("150"), 150);
  });
  test("rechaza vacio, cero, negativos y texto", () => {
    assert.equal(parseCantidad(""), null);
    assert.equal(parseCantidad("0"), null);
    assert.equal(parseCantidad("-2"), null);
    assert.equal(parseCantidad("abc"), null);
  });
});

describe("ajustarCantidad", () => {
  test("kg al gramo, sin basura de coma flotante", () => {
    assert.equal(ajustarCantidad(0.355 + 0.1, "kg"), 0.455);
    assert.equal(ajustarCantidad(0, "kg"), 0.001);
  });
  test("por unidad, entera y minimo 1", () => {
    assert.equal(ajustarCantidad(2.6, "un"), 3);
    assert.equal(ajustarCantidad(0, "un"), 1);
  });
});

describe("separarMultiplicador", () => {
  test("150*tornillo", () => {
    assert.deepEqual(separarMultiplicador("150*tornillo"), { cantidad: 150, texto: "tornillo" });
  });
  test("con codigo de barras y espacios", () => {
    assert.deepEqual(separarMultiplicador(" 12 * 7790001234567"), { cantidad: 12, texto: "7790001234567" });
  });
  test("decimal con coma (kg)", () => {
    assert.deepEqual(separarMultiplicador("1,5*papa"), { cantidad: 1.5, texto: "papa" });
  });
  test("sin asterisco, o con x (ofertas 3x2), no se toca", () => {
    assert.deepEqual(separarMultiplicador("yerba"), { cantidad: null, texto: "yerba" });
    assert.deepEqual(separarMultiplicador("3x2"), { cantidad: null, texto: "3x2" });
  });
  test("solo la cantidad y el asterisco: queda esperando el producto", () => {
    assert.deepEqual(separarMultiplicador("150*"), { cantidad: 150, texto: "" });
  });
});
