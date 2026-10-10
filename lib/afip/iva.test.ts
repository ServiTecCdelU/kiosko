// lib/afip/iva.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { desglosarIva, desgloseConsistente, prorratearDesglose, tipoComprobante, CONDICION_RECEPTOR_ID } from "./iva.ts";
import { CBTE } from "./constantes.ts";

describe("tipoComprobante", () => {
  test("monotributo siempre C", () => {
    assert.equal(tipoComprobante("monotributo", "consumidor_final"), CBTE.FACTURA_C);
    assert.equal(tipoComprobante("monotributo", "responsable_inscripto"), CBTE.FACTURA_C);
    assert.equal(tipoComprobante("monotributo", "exento", true), CBTE.NOTA_CREDITO_C);
  });
  test("inscripto: A a inscriptos, B al resto", () => {
    assert.equal(tipoComprobante("responsable_inscripto", "responsable_inscripto"), CBTE.FACTURA_A);
    assert.equal(tipoComprobante("responsable_inscripto", "responsable_inscripto", true), CBTE.NOTA_CREDITO_A);
    assert.equal(tipoComprobante("responsable_inscripto", "consumidor_final"), CBTE.FACTURA_B);
    assert.equal(tipoComprobante("responsable_inscripto", "monotributo"), CBTE.FACTURA_B);
    assert.equal(tipoComprobante("responsable_inscripto", "exento", true), CBTE.NOTA_CREDITO_B);
  });
  test("ids de condicion del receptor", () => {
    assert.deepEqual(CONDICION_RECEPTOR_ID, { consumidor_final: 5, responsable_inscripto: 1, monotributo: 6, exento: 4 });
  });
});

describe("desglosarIva", () => {
  test("un solo item al 21 %: neto hacia atras y suma exacta", () => {
    const d = desglosarIva([{ subtotal: 1210, iva: 21 }], 1210);
    assert.deepEqual(d, { neto: 1000, iva: 210, exento: 0, alicuotas: [{ id: 5, alicuota: 21, base: 1000, importe: 210 }] });
    assert.ok(desgloseConsistente(d, 1210));
  });

  test("varias alicuotas y exento, ordenadas por base", () => {
    const d = desglosarIva([
      { subtotal: 1210, iva: 21 },     // leche saborizada
      { subtotal: 221, iva: 10.5 },    // pan
      { subtotal: 500, iva: 0 },       // leche fluida: exenta
    ], 1931);
    assert.equal(d.exento, 500);
    assert.equal(d.neto, 1200);
    assert.equal(d.iva, 231);
    assert.deepEqual(d.alicuotas.map((a) => [a.id, a.base, a.importe]), [[5, 1000, 210], [4, 200, 21]]);
    assert.ok(desgloseConsistente(d, 1931));
  });

  test("descuento del ticket: se prorratea y el total facturado es el cobrado", () => {
    const d = desglosarIva([{ subtotal: 1000, iva: 21 }, { subtotal: 1000, iva: 10.5 }], 1800);
    assert.ok(desgloseConsistente(d, 1800));
    assert.equal(d.alicuotas[0].base + d.alicuotas[0].importe, 900);
  });

  test("centavos de redondeo: siempre cierra al centavo", () => {
    for (const total of [0.01, 0.03, 1, 33.33, 99.99, 1234.57, 777777.77]) {
      const d = desglosarIva([
        { subtotal: total * 0.37, iva: 21 }, { subtotal: total * 0.33, iva: 10.5 }, { subtotal: total * 0.3, iva: 0 },
      ], total);
      assert.ok(desgloseConsistente(d, total), `no cierra para ${total}: ${JSON.stringify(d)}`);
    }
  });

  test("items vacios: todo exento, asi AFIP recibe sumas que cierran", () => {
    assert.deepEqual(desglosarIva([], 100), { neto: 0, iva: 0, exento: 100, alicuotas: [] });
  });

  test("alicuota desconocida se trata como exenta en vez de romper", () => {
    const d = desglosarIva([{ subtotal: 100, iva: 15 }], 100);
    assert.equal(d.exento, 100);
    assert.equal(d.alicuotas.length, 0);
  });

  test("total cero o negativo: nada", () => {
    assert.deepEqual(desglosarIva([{ subtotal: 10, iva: 21 }], 0).alicuotas, []);
  });
});

describe("prorratearDesglose", () => {
  test("nota de credito parcial mantiene la mezcla y cierra exacto", () => {
    const original = desglosarIva([{ subtotal: 1210, iva: 21 }, { subtotal: 500, iva: 0 }], 1710);
    const nc = prorratearDesglose(original, 855);
    assert.ok(desgloseConsistente(nc, 855));
    assert.equal(nc.exento, 250);
    assert.equal(nc.alicuotas[0].base, 500);
    assert.equal(nc.alicuotas[0].importe, 105);
  });
  test("total cero: vacio", () => {
    assert.deepEqual(prorratearDesglose({ neto: 100, iva: 21, exento: 0, alicuotas: [] }, 0).alicuotas, []);
  });
});
