// lib/oferta-historial.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { familiaOferta, rankingPromos, textoPromoHistorial, type RegistroOferta } from "./oferta-historial.ts";

const reg = (tipo: string, valor: number, variacionPct: number | null, extra: Partial<RegistroOferta> = {}): RegistroOferta => ({
  productoNombre: "X", tipo, valor, cantidad: null, variacionPct, facturadoDurante: 1000, ...extra,
});

describe("familiaOferta", () => {
  test("agrupa porcentajes por tramo", () => {
    assert.equal(familiaOferta(reg("porcentaje", 10, 0)), "Hasta 10% off");
    assert.equal(familiaOferta(reg("porcentaje", 15, 0)), "11% a 20% off");
    assert.equal(familiaOferta(reg("porcentaje", 25, 0)), "21% a 30% off");
    assert.equal(familiaOferta(reg("porcentaje", 40, 0)), "Más de 30% off");
  });

  test("agrupa combos por cantidad", () => {
    assert.equal(familiaOferta(reg("combo", 1000, 0, { cantidad: 2 })), "Combos de 2 (2x1, 2da con descuento)");
    assert.equal(familiaOferta(reg("combo", 2000, 0, { cantidad: 3 })), "Combos de 3 (3x2...)");
    assert.equal(familiaOferta(reg("combo", 3000, 0, { cantidad: 6 })), "Combos de 4 o más");
  });

  test("descuento en pesos", () => {
    assert.equal(familiaOferta(reg("monto", 200, 0)), "Descuento en $");
  });
});

describe("rankingPromos", () => {
  test("promedia la variacion por familia y ordena de mejor a peor", () => {
    const r = rankingPromos([
      reg("porcentaje", 10, 5),
      reg("porcentaje", 8, 15),
      reg("combo", 2000, 150, { cantidad: 3 }),
      reg("combo", 2000, 50, { cantidad: 3 }),
      reg("monto", 100, null), // sin medicion: no cuenta
    ]);
    assert.equal(r.length, 2);
    assert.equal(r[0].familia, "Combos de 3 (3x2...)");
    assert.equal(r[0].variacionPromedio, 100);
    assert.equal(r[0].cantidad, 2);
    assert.equal(r[0].facturado, 2000);
    assert.equal(r[1].variacionPromedio, 10);
  });

  test("sin registros medidos no hay ranking", () => {
    assert.deepEqual(rankingPromos([reg("monto", 100, null)]), []);
  });
});

describe("textoPromoHistorial", () => {
  test("describe la promo sin depender del precio de ese momento", () => {
    assert.equal(textoPromoHistorial(reg("porcentaje", 20, 0)), "-20%");
    assert.equal(textoPromoHistorial(reg("monto", 1500, 0)), "-$1.500");
    assert.equal(textoPromoHistorial(reg("combo", 2000, 0, { cantidad: 3 })), "3 por $2.000");
  });
});
