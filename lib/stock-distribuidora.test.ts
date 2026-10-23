// lib/stock-distribuidora.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  armarLote, conStock, disponibleParaMover, unirStock,
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
    { productoId: null, distId: "d2", nombre: "Yerba Playadito", codigo: null, stockComercio: 0, stockDistribuidora: 5 },
  ];
  test("sin tildes y por varias palabras", () => {
    assert.deepEqual(filtrarFilas(filas, "azucar 1kg").map((f) => f.distId), ["d1"]);
    assert.deepEqual(filtrarFilas(filas, "779").map((f) => f.distId), ["d1"]);
    assert.equal(filtrarFilas(filas, "  ").length, 2);
  });
});

describe("unirStock", () => {
  const remotos = [
    { id: "prod_mp_1", name: "Yerba", codigo: "1", stock: 20 },
    { id: "prod_mp_2", name: "Arroz", codigo: "2", stock: 0 },
  ];
  const locales = [
    { id: "c__prod_mp_1", distId: "prod_mp_1", nombre: "Yerba Playadito", codigo: "1", stock: 3 },
    { id: "c__prod_mp_9", distId: "prod_mp_9", nombre: "Fideos", codigo: "9", stock: 4 },
  ];

  test("todo lo de la distribuidora, lo tenga o no el super, y lo del super que alla no esta", () => {
    const filas = unirStock(remotos, locales);
    assert.deepEqual(filas.map((f) => [f.distId, f.productoId, f.stockComercio, f.stockDistribuidora]), [
      ["prod_mp_2", null, 0, 0],
      ["prod_mp_9", "c__prod_mp_9", 4, null],
      ["prod_mp_1", "c__prod_mp_1", 3, 20],
    ]);
  });

  test("sin respuesta de la distribuidora quedan solo los del super", () => {
    assert.deepEqual(unirStock(null, locales).map((f) => f.distId), ["prod_mp_9", "prod_mp_1"]);
  });

  test("de entrada se ve solo lo que tiene stock en algun lado", () => {
    assert.deepEqual(conStock(unirStock(remotos, locales)).map((f) => f.distId), ["prod_mp_9", "prod_mp_1"]);
  });
});

describe("pasar varios de una", () => {
  const filas = [
    { productoId: "a", distId: "d1", nombre: "A", codigo: null, stockComercio: 2, stockDistribuidora: 30 },
    { productoId: null, distId: "d2", nombre: "B", codigo: null, stockComercio: 0, stockDistribuidora: 4 },
    { productoId: "c", distId: "d3", nombre: "C", codigo: null, stockComercio: 5, stockDistribuidora: 0 },
  ];

  test("10 de cada uno: si hay menos pasa lo que hay, si no hay se saltea", () => {
    assert.deepEqual(armarLote(filas, "a_comercio", 10), [{ distId: "d1", cantidad: 10 }, { distId: "d2", cantidad: 4 }]);
  });

  test("todo el stock del origen", () => {
    assert.deepEqual(armarLote(filas, "a_distribuidora", "todo"), [{ distId: "d1", cantidad: 2 }, { distId: "d3", cantidad: 5 }]);
  });

  test("lo fraccionado no se mueve (solo enteros)", () => {
    assert.equal(disponibleParaMover({ ...filas[0], stockComercio: 2.5 }, "a_distribuidora"), 2);
  });
});
