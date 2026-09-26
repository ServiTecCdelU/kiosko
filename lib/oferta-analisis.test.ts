// lib/oferta-analisis.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analizarOferta, etiquetaOferta, precioRedondo, plantillasOferta, textoCompartirOferta,
} from "./oferta-analisis.ts";

const base = { price: 1000, precioBase: 600 };

describe("analizarOferta", () => {
  test("sin costo no calcula margenes", () => {
    const a = analizarOferta({ price: 1000, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 20 });
    assert.equal(a.precioUnitario, 800);
    assert.equal(a.ahorroPct, 20);
    assert.equal(a.margenOfertaPct, null);
    assert.equal(a.ventasExtraPct, null);
  });

  test("un 20% de descuento sobre costo 600 deja margen del 25%", () => {
    const a = analizarOferta({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 20 });
    assert.equal(a.margenActualPct, 40);
    assert.equal(a.margenOfertaPct, 25);
    assert.equal(a.gananciaUnitaria, 200);
    // ganaba 400 por unidad, ahora 200: necesita vender el doble
    assert.equal(a.ventasExtraPct, 100);
    assert.equal(a.bajoCosto, false);
  });

  test("detecta la venta a perdida", () => {
    const a = analizarOferta({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 500 });
    assert.equal(a.precioUnitario, 500);
    assert.equal(a.bajoCosto, true);
    assert.equal(a.ventasExtraPct, null);
  });

  test("un combo 3x2 cobra 666,67 por unidad", () => {
    const a = analizarOferta({ ...base, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 2000, ofertaCantidad: 3 });
    assert.equal(a.unidades, 3);
    assert.equal(a.totalPromo, 2000);
    assert.equal(a.precioUnitario, 666.67);
    assert.equal(a.ahorroTotal, 1000);
    assert.equal(a.ahorroPct, 33);
  });

  test("sin oferta valida devuelve el precio de lista", () => {
    const a = analizarOferta({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 0 });
    assert.equal(a.precioUnitario, 1000);
    assert.equal(a.ahorroTotal, 0);
  });
});

describe("etiquetaOferta", () => {
  test("porcentaje y monto", () => {
    assert.equal(etiquetaOferta({ price: 1000, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 15 }), "-15%");
    assert.equal(etiquetaOferta({ price: 1000, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 200 }), "-$200");
  });

  test("combos conocidos", () => {
    const c = (n: number, v: number) => ({ price: 1000, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaCantidad: n, ofertaValor: v });
    assert.equal(etiquetaOferta(c(2, 1000)), "2x1");
    assert.equal(etiquetaOferta(c(3, 2000)), "3x2");
    assert.equal(etiquetaOferta(c(4, 3000)), "4x3");
    assert.equal(etiquetaOferta(c(2, 1500)), "-50% en la 2da");
    assert.equal(etiquetaOferta(c(2, 1300)), "-70% en la 2da");
    assert.equal(etiquetaOferta(c(3, 2500)), "3x$2.500");
  });

  test("sin oferta devuelve null", () => {
    assert.equal(etiquetaOferta({ price: 1000 }), null);
  });
});

describe("precioRedondo", () => {
  test("baja al numero terminado en 90 para precios de 4 cifras", () => {
    assert.equal(precioRedondo(1843), 1790);
    assert.equal(precioRedondo(1890), 1890);
    assert.equal(precioRedondo(12345), 12290);
  });

  test("termina en 9 para precios de 3 cifras", () => {
    assert.equal(precioRedondo(463), 459);
    assert.equal(precioRedondo(459), 459);
  });

  test("precios chicos quedan enteros", () => {
    assert.equal(precioRedondo(87.5), 87);
  });
});

describe("plantillasOferta", () => {
  test("arma las combinaciones a partir del precio", () => {
    const ps = plantillasOferta(1000);
    const dosPorUno = ps.find((p) => p.id === "2x1");
    assert.deepEqual(dosPorUno?.oferta, { tipo: "combo", cantidad: 2, valor: 1000 });
    const segunda = ps.find((p) => p.id === "2da50");
    assert.deepEqual(segunda?.oferta, { tipo: "combo", cantidad: 2, valor: 1500 });
  });
});

describe("textoCompartirOferta", () => {
  test("incluye nombre, precios y ahorro", () => {
    const t = textoCompartirOferta(
      { name: "Yerba 1kg", price: 1000, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 20 },
      "Despensa Rosa",
    );
    assert.match(t, /Yerba 1kg/);
    assert.match(t, /\$800/);
    assert.match(t, /Ahorrás \$200/);
    assert.match(t, /Despensa Rosa/);
  });

  test("un combo muestra el total del combo", () => {
    const t = textoCompartirOferta({ name: "Gaseosa", price: 1000, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 2000, ofertaCantidad: 3 });
    assert.match(t, /3x2/);
    assert.match(t, /Llevando 3 pagás \$2\.000/);
  });
});
