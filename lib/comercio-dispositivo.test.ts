// lib/comercio-dispositivo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizarCodigoComercio } from "./comercio-dispositivo.ts";

describe("normalizarCodigoComercio", () => {
  test("el codigo tal cual", () => {
    assert.equal(normalizarCodigoComercio("kiosco-el-sol"), "kiosco-el-sol");
  });
  test("con barra, mayusculas y espacios", () => {
    assert.equal(normalizarCodigoComercio("  /Kiosco-El-Sol/ "), "kiosco-el-sol");
  });
  test("el link entero del panel, con basePath y parametros", () => {
    assert.equal(normalizarCodigoComercio("https://www.servitec.net.ar/comercio/kiosco-el-sol?x=1"), "kiosco-el-sol");
  });
  test("basura: vacio (no se manda nada al servidor)", () => {
    assert.equal(normalizarCodigoComercio("kiosco el sol!!"), "");
    assert.equal(normalizarCodigoComercio(""), "");
  });
});
