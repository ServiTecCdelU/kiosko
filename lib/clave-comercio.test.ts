// lib/clave-comercio.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { claveDeComercio } from "./clave-de-comercio.ts";

describe("claveDeComercio", () => {
  test("dos comercios en la misma PC nunca comparten clave", () => {
    assert.notEqual(claveDeComercio("kiosko:tickets-espera", "comercio_a"), claveDeComercio("kiosko:tickets-espera", "comercio_b"));
  });
  test("sin sesion no hay clave (no se guarda nada que despues lea otro comercio)", () => {
    assert.equal(claveDeComercio("kiosko:tickets-espera", null), null);
    assert.equal(claveDeComercio("kiosko:tickets-espera", ""), null);
  });
});
