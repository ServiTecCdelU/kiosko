// lib/afip/datos-fiscales.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validarDatosFiscales, validarOperacion } from "./datos-fiscales.ts";

const ok = { cuit: "20-12345678-6", razonSocial: "Ana Pérez", domicilio: "San Martín 123, Concepción del Uruguay", inicioActividades: "2020-03-01" };

describe("validarDatosFiscales", () => {
  test("acepta y normaliza el CUIT a 11 digitos", () => {
    const r = validarDatosFiscales(ok);
    assert.ok(r.ok && r.datos.cuit === "20123456786" && r.datos.ingresosBrutos === null);
  });
  test("rechaza CUIT con verificador incorrecto", () => {
    const r = validarDatosFiscales({ ...ok, cuit: "20123456785" });
    assert.ok(!r.ok && /CUIT/.test(r.error));
  });
  test("exige razon social y domicilio", () => {
    assert.equal(validarDatosFiscales({ ...ok, razonSocial: "" }).ok, false);
    assert.equal(validarDatosFiscales({ ...ok, domicilio: "x" }).ok, false);
  });
  test("fecha de inicio en formato AAAA-MM-DD", () => {
    assert.equal(validarDatosFiscales({ ...ok, inicioActividades: "01/03/2020" }).ok, false);
  });
});

describe("validarOperacion", () => {
  test("punto de venta numerico, ambiente y modo validos", () => {
    const r = validarOperacion({ puntoVenta: "3", ambiente: "produccion", modo: "automatico" });
    assert.ok(r.ok && r.datos.puntoVenta === 3);
  });
  test("rechaza punto de venta 0 o ambiente desconocido", () => {
    assert.equal(validarOperacion({ puntoVenta: 0, ambiente: "homologacion", modo: "manual" }).ok, false);
    assert.equal(validarOperacion({ puntoVenta: 1, ambiente: "test", modo: "manual" }).ok, false);
  });
});
