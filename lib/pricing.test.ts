// lib/pricing.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tieneOferta, precioFinal, ahorroOferta, precioLinea, comboLabel } from "./pricing.ts";

const base = { price: 1000 };

describe("tieneOferta", () => {
  test("sin oferta activa devuelve false", () => {
    assert.equal(tieneOferta(base), false);
    assert.equal(tieneOferta({ ...base, ofertaActiva: false, ofertaTipo: "porcentaje", ofertaValor: 10 }), false);
  });

  test("una oferta activa con valor 0 no cuenta como oferta", () => {
    assert.equal(tieneOferta({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 0 }), false);
  });

  test("un combo necesita cantidad mayor a 1", () => {
    const combo = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 1500 };
    assert.equal(tieneOferta({ ...combo, ofertaCantidad: 1 }), false);
    assert.equal(tieneOferta({ ...combo, ofertaCantidad: 2 }), true);
  });
});

describe("precioFinal", () => {
  test("aplica el porcentaje de descuento", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 20 };
    assert.equal(precioFinal(p), 800);
  });

  test("aplica el descuento fijo", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "monto" as any, ofertaValor: 250 };
    assert.equal(precioFinal(p), 750);
  });

  test("nunca devuelve un precio negativo", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "monto" as any, ofertaValor: 5000 };
    assert.equal(precioFinal(p), 0);
  });

  test("redondea a dos decimales", () => {
    const p = { price: 333.333, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 10 };
    assert.equal(precioFinal(p), 300);
  });

  test("para un combo devuelve el precio de lista (el subtotal lo da precioLinea)", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 1500, ofertaCantidad: 2 };
    assert.equal(precioFinal(p), 1000);
  });
});

describe("ahorroOferta", () => {
  test("sin oferta el ahorro es cero", () => {
    assert.equal(ahorroOferta(base), 0);
  });

  test("con descuento devuelve la diferencia contra el precio de lista", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 25 };
    assert.equal(ahorroOferta(p), 250);
  });
});

describe("precioLinea", () => {
  test("sin oferta multiplica precio por cantidad", () => {
    assert.equal(precioLinea(base, 3), 3000);
  });

  test("con descuento aplica el precio con oferta a cada unidad", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 10 };
    assert.equal(precioLinea(p, 3), 2700);
  });

  test("combo 3x$2500: tres unidades cuestan el precio del combo", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 2500, ofertaCantidad: 3 };
    assert.equal(precioLinea(p, 3), 2500);
  });

  test("combo: las unidades sueltas se cobran a precio de lista", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 2500, ofertaCantidad: 3 };
    // 4 unidades = 1 combo (2500) + 1 suelta (1000)
    assert.equal(precioLinea(p, 4), 3500);
    // 7 unidades = 2 combos (5000) + 1 suelta (1000)
    assert.equal(precioLinea(p, 7), 6000);
  });

  test("combo: por debajo de la cantidad minima se cobra todo a precio de lista", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 2500, ofertaCantidad: 3 };
    assert.equal(precioLinea(p, 2), 2000);
  });

  test("cantidad cero da cero", () => {
    assert.equal(precioLinea(base, 0), 0);
  });

  test("soporta cantidades decimales (venta por kg)", () => {
    assert.equal(precioLinea({ price: 2500 }, 0.35), 875);
  });
});

describe("comboLabel", () => {
  test("sin combo no hay etiqueta", () => {
    assert.equal(comboLabel(base), null);
    assert.equal(comboLabel({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 10 }), null);
  });

  test("dos unidades al precio de una se muestra como 2x1", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 1000, ofertaCantidad: 2 };
    assert.equal(comboLabel(p), "2x1");
  });

  test("el resto se muestra como NxPRECIO", () => {
    const p = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 2500, ofertaCantidad: 3 };
    assert.equal(comboLabel(p), "3x$2500");
  });
});
