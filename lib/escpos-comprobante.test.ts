// lib/escpos-comprobante.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { comandoQr, generarComprobanteEscPos, seccionesComprobante } from "./escpos-comprobante.ts";
import { CMD_CORTE } from "./escpos.ts";

const base = {
  comprobante: {
    id: "fac_1", cbteTipo: 6, puntoVenta: 3, numero: 42, fecha: "2026-10-10", total: 1931,
    docTipo: 99, docNro: "0", receptorNombre: null, receptorCondicion: 5, tipoAutorizacion: "CAE" as const, cae: "76401234567890", caeVto: "2026-10-20",
    ambiente: "produccion" as const, asociado: null,
    items: [
      { nombre: "Leche saborizada 1L", cantidad: 1, precio: 1210, subtotal: 1210 },
      { nombre: "Pan francés", cantidad: 1, precio: 221, subtotal: 221 },
      { nombre: "Leche fluida", cantidad: 1, precio: 500, subtotal: 500 },
    ],
    neto: 1200, iva: 231, exento: 500,
    alicuotas: [{ id: 5, alicuota: 21, base: 1000, importe: 210 }, { id: 4, alicuota: 10.5, base: 200, importe: 21 }],
    qr: "https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9",
  },
  emisor: {
    razonSocial: "Súper Ñandú SRL", cuit: "30123456789", domicilio: "Av. Siempreviva 742, Concepción del Uruguay",
    ingresosBrutos: "30123456789", inicioActividades: "2020-01-01", condicionIva: "responsable_inscripto" as const,
  },
};

function textoDe(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
}

describe("comandoQr", () => {
  test("arma la secuencia GS ( k con el largo correcto", () => {
    const q = comandoQr("hola", 3);
    // modelo (9) + tamano (8) + correccion (8) + guardar (8 + 4) + imprimir (8)
    assert.equal(q.length, 9 + 8 + 8 + 12 + 8);
    const guardar = q.slice(25, 33);
    assert.deepEqual(guardar, [0x1d, 0x28, 0x6b, 7, 0, 0x31, 0x50, 0x30]);
    assert.deepEqual(q.slice(33, 37), [104, 111, 108, 97]);
  });
  test("datos largos usan pH", () => {
    const q = comandoQr("x".repeat(300));
    assert.deepEqual(q.slice(28, 30), [(303) & 0xff, 1]);
  });
});

describe("seccionesComprobante", () => {
  test("Factura B: leyenda de transparencia fiscal, condicion del receptor y sin desglose", () => {
    const s = seccionesComprobante(base, 48).map((x) => x.texto);
    assert.ok(s.includes("IVA Responsable Inscripto"));
    assert.ok(s.some((l) => l.startsWith("Factura B")));
    assert.ok(s.includes("Consumidor Final"));
    assert.ok(s.some((l) => l.includes("IVA contenido") && l.endsWith("$231")));
    assert.ok(!s.some((l) => l.startsWith("Neto gravado")));
    assert.ok(s.some((l) => l.startsWith("TOTAL") && l.endsWith("$1.931")));
    assert.ok(s.includes("CAE 76401234567890"));
    for (const l of s) assert.ok(l.length <= 48, `"${l}" se pasa de 48`);
  });
  test("Factura A: precios sin IVA, neto, IVA por alicuota y exento", () => {
    const a = { ...base, comprobante: { ...base.comprobante, cbteTipo: 1, docTipo: 80, docNro: "20123456786", receptorCondicion: 1, receptorNombre: "Distribuidora SA" } };
    const s = seccionesComprobante(a, 48).map((x) => x.texto);
    assert.ok(s.some((l) => l.endsWith("Precios sin IVA")));
    assert.ok(s.some((l) => l.startsWith("Neto gravado") && l.endsWith("$1.200")));
    assert.ok(s.some((l) => l.startsWith("IVA 21%") && l.endsWith("$210")));
    assert.ok(s.some((l) => l.startsWith("IVA 10,5%") && l.endsWith("$21")));
    assert.ok(s.some((l) => l.startsWith("Exento") && l.endsWith("$500")));
    assert.ok(s.some((l) => l.includes("CUIT 20123456786 - Distribuidora SA")));
    assert.ok(!s.some((l) => l.includes("IVA contenido")));
  });
  test("Factura C en homologacion: sin leyendas de IVA y con aviso de prueba", () => {
    const c = { ...base, comprobante: { ...base.comprobante, cbteTipo: 11, neto: null, iva: null, exento: null, alicuotas: [], ambiente: "homologacion" as const }, emisor: { ...base.emisor, condicionIva: "monotributo" as const } };
    const s = seccionesComprobante(c, 32).map((x) => x.texto);
    assert.ok(s.includes("Responsable Monotributo"));
    assert.ok(!s.includes("Consumidor Final"));
    assert.ok(s.join(" ").includes("SIN VALIDEZ FISCAL"));
    for (const l of s) assert.ok(l.length <= 32, `"${l}" se pasa de 32`);
  });
  test("nota de credito muestra el comprobante asociado", () => {
    const nc = { ...base, comprobante: { ...base.comprobante, cbteTipo: 8, asociado: { cbteTipo: 6, puntoVenta: 3, numero: 40 } } };
    const s = seccionesComprobante(nc, 48).map((x) => x.texto);
    assert.ok(s.some((l) => l.startsWith("Nota de credito B")));
    assert.ok(s.includes("Asociada a Factura B 00003-00000040"));
  });
});

describe("generarComprobanteEscPos", () => {
  test("reset al inicio, QR con la URL de AFIP y corte al final; todo ASCII", () => {
    const b = generarComprobanteEscPos(base);
    assert.deepEqual(Array.from(b.slice(0, 2)), [0x1b, 0x40]);
    assert.deepEqual(Array.from(b.slice(-4)), CMD_CORTE);
    const t = textoDe(b);
    assert.ok(t.includes("Super Nandu SRL"));
    assert.ok(t.includes(base.comprobante.qr));
    assert.ok(t.includes("\x1d(k"));
    for (const byte of b) assert.ok(byte <= 0x7e, `byte fuera de ASCII: ${byte}`);
  });
});
