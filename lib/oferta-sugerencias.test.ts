// lib/oferta-sugerencias.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sugerirOferta, type CandidatoOferta } from "./oferta-sugerencias.ts";

const base: CandidatoOferta = {
  price: 1000, precioBase: 500, stock: 60, unidadesVendidas: 6, diasHistoria: 30, unidad: "un",
};

describe("sugerirOferta", () => {
  test("stock para muchos dias es estancado y propone una promo fuerte", () => {
    // vende 0,2/dia con 60 en stock: 300 dias de stock
    const s = sugerirOferta(base);
    assert.equal(s?.motivo, "estancado");
    assert.equal(s?.diasDeStock, 300);
    assert.equal(s?.plantilla.id, "3x2");
    assert.equal(s?.capital, 30000);
  });

  test("respeta el margen minimo: si el 3x2 deja poco margen, baja la promo", () => {
    // costo 700: 3x2 -> 666/u, bajo costo; 2da al 50% -> 750/u (6,7%); -20% -> 800 (12,5%)
    const s = sugerirOferta({ ...base, precioBase: 700 });
    assert.equal(s?.plantilla.id, "p20");
    assert.ok((s?.margenOfertaPct ?? 0) >= 10);
  });

  test("sin ventas en todo el periodo", () => {
    const s = sugerirOferta({ ...base, unidadesVendidas: 0 });
    assert.equal(s?.motivo, "sin-ventas");
    assert.equal(s?.diasDeStock, null);
  });

  test("buen margen y poca rotacion", () => {
    // 0,4/dia con 10 en stock = 25 dias (no estancado), margen 50%
    const s = sugerirOferta({ ...base, stock: 10, unidadesVendidas: 12 });
    assert.equal(s?.motivo, "margen-alto");
  });

  test("un producto que rota bien no necesita oferta", () => {
    assert.equal(sugerirOferta({ ...base, stock: 20, unidadesVendidas: 90 }), null);
  });

  test("producto nuevo, con poca historia, no se juzga", () => {
    assert.equal(sugerirOferta({ ...base, unidadesVendidas: 0, diasHistoria: 5 }), null);
  });

  test("por kg no propone combos", () => {
    const s = sugerirOferta({ ...base, unidad: "kg" });
    assert.equal(s?.plantilla.oferta.tipo, "porcentaje");
  });

  test("sin costo propone la promo mas suave", () => {
    const s = sugerirOferta({ ...base, precioBase: undefined });
    assert.equal(s?.plantilla.id, "p10");
    assert.equal(s?.margenOfertaPct, null);
  });

  test("poco stock sin ventas no vale la pena", () => {
    assert.equal(sugerirOferta({ ...base, stock: 2, unidadesVendidas: 0 }), null);
  });
});
