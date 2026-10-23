// lib/stock-distribuidora.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cantidadTransferible, deltaDistribuidora, esDireccion, estadoTrasPaso, estaAbierta, filtrarFilas, ladoDelPaso, siguientePaso,
} from "./stock-distribuidora.ts";

describe("cantidadTransferible", () => {
  test("enteros positivos", () => {
    assert.equal(cantidadTransferible(3), 3);
    assert.equal(cantidadTransferible("12"), 12);
  });
  test("rechaza cero, negativos, decimales y basura", () => {
    for (const v of [0, -2, 1.5, "1,5", "", "abc", null, undefined, NaN, 1_000_000]) assert.equal(cantidadTransferible(v), null, String(v));
  });
});

describe("pasos de una transferencia", () => {
  test("siempre primero el origen y despues el destino", () => {
    assert.equal(siguientePaso("pendiente"), "origen");
    assert.equal(siguientePaso("origen_ok"), "destino");
    assert.equal(siguientePaso("completa"), null);
    assert.equal(siguientePaso("fallida"), null);
    assert.equal(estadoTrasPaso("origen"), "origen_ok");
    assert.equal(estadoTrasPaso("destino"), "completa");
  });

  test("hacia el comercio: sale de la distribuidora y entra al comercio", () => {
    assert.equal(ladoDelPaso("a_comercio", "origen"), "distribuidora");
    assert.equal(ladoDelPaso("a_comercio", "destino"), "comercio");
    assert.equal(deltaDistribuidora("a_comercio", 5), -5);
  });

  test("hacia la distribuidora: sale del comercio y entra a la distribuidora", () => {
    assert.equal(ladoDelPaso("a_distribuidora", "origen"), "comercio");
    assert.equal(ladoDelPaso("a_distribuidora", "destino"), "distribuidora");
    assert.equal(deltaDistribuidora("a_distribuidora", 5), 5);
  });

  test("abiertas: las que hay que reintentar", () => {
    assert.ok(estaAbierta("pendiente"));
    assert.ok(estaAbierta("origen_ok"));
    assert.ok(!estaAbierta("completa"));
    assert.ok(!estaAbierta("fallida"));
  });

  test("direccion valida", () => {
    assert.ok(esDireccion("a_comercio"));
    assert.ok(!esDireccion("a_otro"));
  });
});

describe("filtrarFilas", () => {
  const filas = [
    { productoId: "1", distId: "d1", nombre: "Azúcar Ledesma 1kg", codigo: "779", stockComercio: 1, stockDistribuidora: 2 },
    { productoId: "2", distId: "d2", nombre: "Yerba Playadito", codigo: null, stockComercio: 0, stockDistribuidora: 5 },
  ];
  test("sin tildes y por varias palabras", () => {
    assert.deepEqual(filtrarFilas(filas, "azucar 1kg").map((f) => f.productoId), ["1"]);
    assert.deepEqual(filtrarFilas(filas, "779").map((f) => f.productoId), ["1"]);
    assert.equal(filtrarFilas(filas, "  ").length, 2);
  });
});
