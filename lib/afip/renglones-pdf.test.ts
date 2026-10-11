// lib/afip/renglones-pdf.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { agruparLineas, leerRenglones, type TextoPosicionado } from "./renglones-pdf.ts";

const t = (texto: string, x: number, y: number, ancho = texto.length * 5): TextoPosicionado => ({ texto, x, y, ancho });

/** Layout de "Comprobantes en linea" de AFIP: titulos y numeros alineados a la derecha. */
function facturaAfip(): TextoPosicionado[] {
  return [
    t("Razón Social: DISTRIBUIDORA EL SOL S.A.", 30, 700),
    t("Código", 30, 500), t("Producto / Servicio", 80, 500), t("Cantidad", 300, 500), t("U. medida", 350, 500),
    t("Precio Unit.", 400, 500), t("% Bonif", 460, 500), t("Imp. Bonif.", 500, 500), t("Subtotal", 560, 500),
    t("7790895000997", 30, 480), t("Coca Cola 1.5 L", 80, 480), t("12,00", 310, 480), t("unidades", 350, 480),
    t("1.250,50", 405, 480), t("0,00", 465, 480), t("0,00", 505, 480), t("15.006,00", 565, 480),
    t("CC2", 30, 462), t("Galletitas surtidas", 80, 462), t("3", 320, 462), t("unidades", 350, 462),
    t("800,00", 410, 462), t("0,00", 465, 462), t("0,00", 505, 462), t("2.400,00", 568, 462),
    t("paquete x 6", 80, 450),
    t("Subtotal: $", 400, 400), t("17.406,00", 560, 400),
    t("Importe Total: $", 400, 380), t("21.061,26", 560, 380),
    t("CAE N°: 76123456789012", 30, 300),
  ];
}

describe("agruparLineas", () => {
  test("junta por altura con tolerancia y ordena de arriba a abajo", () => {
    const lineas = agruparLineas([t("b", 50, 100), t("a", 10, 101), t("c", 10, 80)]);
    assert.deepEqual(lineas.map((l) => l.texto), ["a b", "c"]);
  });
});

describe("leerRenglones", () => {
  test("lee la tabla por columnas en el formato de AFIP y la razon social", () => {
    const r = leerRenglones(facturaAfip());
    assert.equal(r.razonSocial, "DISTRIBUIDORA EL SOL S.A.");
    assert.equal(r.renglones.length, 2);
    const [a, b] = r.renglones;
    assert.equal(a.codigo, "7790895000997");
    assert.equal(a.descripcion, "Coca Cola 1.5 L");
    assert.equal(a.cantidad, 12);
    assert.equal(a.precioUnitario, 1250.5);
    assert.equal(a.subtotal, 15006);
    assert.equal(a.metodo, "columnas");
    // la segunda linea de descripcion se pega al renglon anterior
    assert.equal(b.descripcion, "Galletitas surtidas paquete x 6");
    assert.equal(b.cantidad, 3);
  });

  test("sin titulos, deduce los renglones por cantidad x precio = subtotal", () => {
    const items = [
      t("DISTRIBUIDORA NORTE", 30, 700),
      t("7790001234567 Yerba Playadito 1 kg 6 2.350,00 14.100,00", 30, 500),
      t("Azúcar Ledesma 1 kg 10 980,50 9.805,00", 30, 480),
      t("Total 23.905,00", 30, 440),
    ];
    const r = leerRenglones(items);
    assert.equal(r.renglones.length, 2);
    assert.equal(r.renglones[0].codigo, "7790001234567");
    assert.equal(r.renglones[0].descripcion, "Yerba Playadito 1 kg");
    assert.equal(r.renglones[0].cantidad, 6);
    assert.equal(r.renglones[0].precioUnitario, 2350);
    assert.equal(r.renglones[1].cantidad, 10);
    assert.equal(r.renglones[1].metodo, "numeros");
  });

  test("sin tabla devuelve motivo", () => {
    const r = leerRenglones([t("Factura A", 30, 700), t("Total 100,00", 30, 600)]);
    assert.equal(r.renglones.length, 0);
    assert.ok(r.motivo);
    assert.equal(leerRenglones([]).motivo, "El PDF no tiene texto: es una imagen escaneada.");
  });
});
