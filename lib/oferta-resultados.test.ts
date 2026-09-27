// lib/oferta-resultados.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resultadoOferta, veredictoOferta, type VentaResumen } from "./oferta-resultados.ts";

const venta = (fecha: string, productId: string, quantity: number, subtotal: number): VentaResumen => ({
  fecha, items: [{ productId, quantity, subtotal }],
});

describe("resultadoOferta", () => {
  // Oferta desde el 15/10; hoy es 18/10 -> 4 dias de oferta; base: 1/10 al 14/10
  const ventas: VentaResumen[] = [
    venta("2026-10-01", "a", 7, 7000),
    venta("2026-10-10", "a", 7, 7000),
    venta("2026-09-30", "a", 100, 100000), // fuera de la base, no cuenta
    venta("2026-10-15", "a", 6, 4800),
    venta("2026-10-18", "a", 6, 4800),
    venta("2026-10-16", "b", 50, 5000), // otro producto
  ];

  test("compara unidades por dia durante la oferta contra las dos semanas previas", () => {
    const r = resultadoOferta(ventas, "a", "2026-10-15", "2026-10-18");
    assert.equal(r.diasDurante, 4);
    assert.equal(r.unidadesDurante, 12);
    assert.equal(r.porDiaDurante, 3);
    assert.equal(r.facturadoDurante, 9600);
    assert.equal(r.unidadesAntes, 14);
    assert.equal(r.porDiaAntes, 1);
    assert.equal(r.variacionPct, 200);
  });

  test("sin ventas previas no hay variacion", () => {
    const r = resultadoOferta([venta("2026-10-15", "a", 3, 3000)], "a", "2026-10-15", "2026-10-15");
    assert.equal(r.porDiaAntes, 0);
    assert.equal(r.variacionPct, null);
  });

  test("una oferta que empieza manana tiene cero dias", () => {
    const r = resultadoOferta(ventas, "a", "2026-10-19", "2026-10-18");
    assert.equal(r.diasDurante, 0);
    assert.equal(r.unidadesDurante, 0);
  });

  test("suma varios items del mismo producto en una venta", () => {
    const v: VentaResumen[] = [{ fecha: "2026-10-15", items: [
      { productId: "a", quantity: 1, subtotal: 100 }, { productId: "a", quantity: 2, subtotal: 200 },
    ] }];
    assert.equal(resultadoOferta(v, "a", "2026-10-15", "2026-10-15").unidadesDurante, 3);
  });
});

describe("veredictoOferta", () => {
  const base = { diasDurante: 5, porDiaAntes: 1, variacionPct: 50 };

  test("clasifica segun la variacion", () => {
    assert.equal(veredictoOferta({ ...base }), "funciona");
    assert.equal(veredictoOferta({ ...base, variacionPct: 5 }), "igual");
    assert.equal(veredictoOferta({ ...base, variacionPct: -10 }), "floja");
  });

  test("con menos de 2 dias es temprano para opinar", () => {
    assert.equal(veredictoOferta({ ...base, diasDurante: 1 }), "temprano");
  });

  test("sin base de comparacion", () => {
    assert.equal(veredictoOferta({ ...base, porDiaAntes: 0, variacionPct: null }), "sin-base");
  });
});
