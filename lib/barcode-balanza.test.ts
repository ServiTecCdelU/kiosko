// lib/barcode-balanza.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCodigoBalanza } from "./barcode-balanza.ts";

describe("parseCodigoBalanza", () => {
  test("prefijo 20, PLU 00042, 350 gramos", () => {
    const r = parseCodigoBalanza("2000042003500");
    assert.ok(r);
    assert.equal(r.plu, "00042");
    assert.deepEqual(r.codigosBusqueda, ["00042", "42"]);
    assert.equal(r.pesoKg, 0.35);
  });

  test("prefijo 21, PLU sin ceros a la izquierda, 1 kg exacto", () => {
    const r = parseCodigoBalanza("2112345010007");
    assert.ok(r);
    assert.equal(r.plu, "12345");
    assert.deepEqual(r.codigosBusqueda, ["12345"]);
    assert.equal(r.pesoKg, 1);
  });

  test("checksum invalido devuelve null", () => {
    assert.equal(parseCodigoBalanza("2000042003501"), null);
  });

  test("EAN-13 comun (prefijo 77 de Argentina) no se interpreta como balanza", () => {
    assert.equal(parseCodigoBalanza("7790001234567"), null);
  });

  test("peso cero devuelve null", () => {
    assert.equal(parseCodigoBalanza("2000042000004"), null);
  });

  test("codigos cortos o no numericos devuelven null", () => {
    assert.equal(parseCodigoBalanza("12345"), null);
    assert.equal(parseCodigoBalanza("20abc42003500"), null);
    assert.equal(parseCodigoBalanza(""), null);
  });
});
