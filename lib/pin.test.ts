// lib/pin.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { errorPinNuevo, esPinParaEntrar } from "./pin.ts";

describe("errorPinNuevo", () => {
  test("acepta un PIN de 6 cualquiera", () => {
    assert.equal(errorPinNuevo("482913"), null);
    assert.equal(errorPinNuevo("070319"), null);
  });

  test("exige exactamente 6 numeros", () => {
    assert.match(errorPinNuevo("1234")!, /6 números/);
    assert.match(errorPinNuevo("1234567")!, /6 números/);
    assert.match(errorPinNuevo("12a456")!, /6 números/);
  });

  test("rechaza todos iguales", () => {
    assert.notEqual(errorPinNuevo("111111"), null);
    assert.notEqual(errorPinNuevo("000000"), null);
  });

  test("rechaza numeros seguidos, para arriba, para abajo y dando la vuelta", () => {
    for (const p of ["123456", "654321", "012345", "789012", "098765"]) assert.notEqual(errorPinNuevo(p), null, p);
  });

  test("rechaza patrones repetidos", () => {
    assert.notEqual(errorPinNuevo("121212"), null);
    assert.notEqual(errorPinNuevo("123123"), null);
  });
});

describe("esPinParaEntrar", () => {
  test("entra con el de 6 o con el viejo de 4 (para pasarse al nuevo)", () => {
    assert.equal(esPinParaEntrar("482913"), true);
    assert.equal(esPinParaEntrar("4829"), true);
    assert.equal(esPinParaEntrar("48291"), false);
    assert.equal(esPinParaEntrar("abcd"), false);
  });
});
