// lib/afip/comprobante.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cuitValido, receptorDeVenta, fechaAfip, fechaDeAfip, importeAfip, urlQrAfip, hoyArgentinaIso, numeroComprobante,
} from "./comprobante.ts";
import { UMBRAL_IDENTIFICACION } from "./constantes.ts";

describe("cuitValido", () => {
  test("acepta CUITs con digito verificador correcto", () => {
    assert.equal(cuitValido("20123456786"), true);
    assert.equal(cuitValido("30500010912"), true);
  });
  test("rechaza verificador incorrecto, largo o letras", () => {
    assert.equal(cuitValido("20123456785"), false);
    assert.equal(cuitValido("2012345678"), false);
    assert.equal(cuitValido("20-12345678-6"), false);
  });
});

describe("receptorDeVenta", () => {
  test("sin cliente: consumidor final 99 / 0, condicion IVA 5", () => {
    const r = receptorDeVenta(5000);
    assert.deepEqual(r, { ok: true, receptor: { docTipo: 99, docNro: "0", condicionIva: 5, nombre: null } });
  });
  test("cliente con DNI", () => {
    const r = receptorDeVenta(5000, { documento: "30.123.456", nombre: "Ana" });
    assert.ok(r.ok && r.receptor.docTipo === 96 && r.receptor.docNro === "30123456" && r.receptor.nombre === "Ana");
  });
  test("cliente con CUIT valido", () => {
    const r = receptorDeVenta(5000, { documento: "20-12345678-6" });
    assert.ok(r.ok && r.receptor.docTipo === 80 && r.receptor.docNro === "20123456786");
  });
  test("CUIT invalido: no se factura con datos falsos", () => {
    assert.equal(receptorDeVenta(5000, { documento: "20123456785" }).ok, false);
  });
  test("documento de largo raro: se factura a consumidor final", () => {
    const r = receptorDeVenta(5000, { documento: "123" });
    assert.ok(r.ok && r.receptor.docTipo === 99);
  });
  test("responsable inscripto: exige CUIT y manda condicion 1", () => {
    assert.match((receptorDeVenta(5000, { documento: "30123456" }, "responsable_inscripto") as { error: string }).error, /CUIT/);
    const r = receptorDeVenta(5000, { documento: "20123456786", nombre: "Distribuidora SA" }, "responsable_inscripto");
    assert.ok(r.ok && r.receptor.docTipo === 80 && r.receptor.condicionIva === 1);
  });
  test("monotributista y exento: condicion 6 y 4", () => {
    assert.ok(receptorDeVenta(5000, { documento: "20123456786" }, "monotributo").ok);
    assert.equal((receptorDeVenta(5000, null, "monotributo") as { receptor: { condicionIva: number } }).receptor.condicionIva, 6);
    assert.equal((receptorDeVenta(5000, null, "exento") as { receptor: { condicionIva: number } }).receptor.condicionIva, 4);
  });
  test(`desde $${UMBRAL_IDENTIFICACION} sin documento no se puede (RG 5700/2025)`, () => {
    assert.equal(receptorDeVenta(UMBRAL_IDENTIFICACION).ok, false);
    assert.equal(receptorDeVenta(UMBRAL_IDENTIFICACION - 1).ok, true);
    assert.equal(receptorDeVenta(UMBRAL_IDENTIFICACION, { documento: "30123456" }).ok, true);
  });
});

describe("fechas e importes", () => {
  test("formato AFIP ida y vuelta", () => {
    assert.equal(fechaAfip("2026-10-03"), "20261003");
    assert.equal(fechaDeAfip("20261003"), "2026-10-03");
    assert.equal(fechaDeAfip("basura"), null);
  });
  test("hoy en Argentina (a las 01:00 UTC todavia es el dia anterior)", () => {
    assert.equal(hoyArgentinaIso(new Date("2026-10-04T01:00:00Z")), "2026-10-03");
  });
  test("importe siempre con 2 decimales y redondeado", () => {
    assert.equal(importeAfip(1500), "1500.00");
    assert.equal(importeAfip(10.005), "10.01");
    assert.equal(importeAfip(0.1 + 0.2), "0.30");
  });
  test("numero de comprobante impreso", () => {
    assert.equal(numeroComprobante(1, 42), "00001-00000042");
  });
});

describe("urlQrAfip", () => {
  test("arma el JSON v1 en base64 con los campos que pide AFIP", () => {
    const url = urlQrAfip({
      fecha: "2026-10-03", cuit: "20123456786", puntoVenta: 2, cbteTipo: 11, numero: 15,
      total: 1234.5, docTipo: 99, docNro: "0", cae: "76123456789012",
    });
    assert.ok(url.startsWith("https://www.afip.gob.ar/fe/qr/?p="));
    const datos = JSON.parse(Buffer.from(url.split("?p=")[1], "base64").toString());
    assert.deepEqual(datos, {
      ver: 1, fecha: "2026-10-03", cuit: 20123456786, ptoVta: 2, tipoCmp: 11, nroCmp: 15, importe: 1234.5,
      moneda: "PES", ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: "E", codAut: 76123456789012,
    });
  });
});
