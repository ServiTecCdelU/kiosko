// lib/afip/qr-comprobante.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatearCuit, leerQrAfip } from "./qr-comprobante.ts";
import { urlQrAfip } from "./comprobante.ts";

const PROVEEDOR = "30712345671"; // CUIT valido
const COMERCIO = "20123456786";

function qrDe(extra: Partial<Parameters<typeof urlQrAfip>[0]> = {}): string {
  return urlQrAfip({
    fecha: "2026-10-05", cuit: PROVEEDOR, puntoVenta: 3, cbteTipo: 1, numero: 1234, total: 15430.5,
    docTipo: 80, docNro: COMERCIO, cae: "76123456789012", ...extra,
  } as Parameters<typeof urlQrAfip>[0]);
}

describe("leerQrAfip", () => {
  test("lee la URL completa que genera la app (ida y vuelta)", () => {
    const r = leerQrAfip(qrDe());
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.comprobante.cuit, PROVEEDOR);
    assert.equal(r.comprobante.nombre, "Factura A 0003-00001234");
    assert.equal(r.comprobante.fecha, "2026-10-05");
    assert.equal(r.comprobante.importe, 15430.5);
    assert.equal(r.comprobante.nroDocRec, COMERCIO);
    assert.equal(r.comprobante.clave, `${PROVEEDOR}-1-3-1234`);
    assert.equal(r.comprobante.esNotaCredito, false);
  });

  test("acepta el base64 solo y el JSON crudo", () => {
    const url = qrDe({ cbteTipo: 6 });
    const b64 = url.split("?p=")[1];
    const r1 = leerQrAfip(b64);
    assert.equal(r1.ok && r1.comprobante.nombreTipo, "Factura B");
    const r2 = leerQrAfip(Buffer.from(b64, "base64").toString("utf8"));
    assert.equal(r2.ok && r2.comprobante.nombreTipo, "Factura B");
  });

  test("detecta notas de credito y tipos MiPyME", () => {
    const nc = leerQrAfip(qrDe({ cbteTipo: 3 }));
    assert.equal(nc.ok && nc.comprobante.esNotaCredito, true);
    const fce = leerQrAfip(qrDe({ cbteTipo: 201 }));
    assert.equal(fce.ok && fce.comprobante.nombreTipo, "Factura de Crédito MiPyME A");
  });

  test("rechaza lo que no es una factura electronica", () => {
    assert.equal(leerQrAfip("").ok, false);
    assert.equal(leerQrAfip("7790895000997").ok, false);
    assert.equal(leerQrAfip("https://www.google.com/?p=abc").ok, false);
    assert.match((leerQrAfip("https://www.mercadolibre.com.ar/x") as { error: string }).error, /no es de AFIP/);
    assert.equal(leerQrAfip("https://www.afip.gob.ar/fe/qr/?p=").ok, false);
  });

  test("rechaza CUIT invalido, importe cero y CAE incompleto", () => {
    assert.equal(leerQrAfip(qrDe({ cuit: "30712345670" })).ok, false);
    assert.equal(leerQrAfip(qrDe({ total: 0 })).ok, false);
    assert.equal(leerQrAfip(qrDe({ cae: "123" })).ok, false);
  });

  test("formatearCuit", () => {
    assert.equal(formatearCuit(PROVEEDOR), "30-71234567-1");
    assert.equal(formatearCuit("123"), "123");
  });
});
