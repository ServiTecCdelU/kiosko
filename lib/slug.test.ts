// lib/slug.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { slugDeNombre, SLUG_MAX } from "./slug.ts";

describe("slugDeNombre", () => {
  test("pasa a minusculas con guiones", () => {
    assert.equal(slugDeNombre("Kiosco El Sol"), "kiosco-el-sol");
  });

  test("saca tildes y eñes", () => {
    assert.equal(slugDeNombre("Almacén Doña Peña"), "almacen-dona-pena");
  });

  test("colapsa simbolos y espacios repetidos y recorta los bordes", () => {
    assert.equal(slugDeNombre("  ¡Despensa   & Fiambrería!! "), "despensa-fiambreria");
  });

  test("un nombre que choca con una ruta de la app recibe sufijo", () => {
    assert.equal(slugDeNombre("Stock"), "stock-comercio");
    assert.equal(slugDeNombre("POS"), "pos-comercio");
  });

  test("sin letras ni numeros cae a un slug generico", () => {
    assert.equal(slugDeNombre("¡¡!!"), "mi-comercio");
  });

  test(`se corta en ${SLUG_MAX} caracteres sin dejar un guion al final`, () => {
    const s = slugDeNombre("Supermercado de la esquina de la avenida principal numero uno");
    assert.ok(s.length <= SLUG_MAX);
    assert.ok(!s.endsWith("-"));
  });

  test("siempre cumple el formato que exige la base", () => {
    for (const n of ["Kiosco 24 hs", "Ñandú", "a--b", "123"]) {
      assert.match(slugDeNombre(n), /^[a-z0-9]+(-[a-z0-9]+)*$/, n);
    }
  });
});
