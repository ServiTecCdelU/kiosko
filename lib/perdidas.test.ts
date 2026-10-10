// lib/perdidas.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { causaPerdida, referenciaMerma, resumenPerdidas } from "./perdidas.ts";

describe("referenciaMerma y causaPerdida", () => {
  test("arma y lee la referencia con y sin nota", () => {
    assert.equal(referenciaMerma("vencido"), "merma:vencido");
    assert.equal(referenciaMerma("rotura", "se cayó la caja"), "merma:rotura · se cayó la caja");
    assert.equal(causaPerdida({ productoId: "a", tipo: "rotura", cantidad: -3, referencia: "merma:vencido" }), "vencido");
    assert.equal(causaPerdida({ productoId: "a", tipo: "rotura", cantidad: -1, referencia: "merma:rotura · nota" }), "rotura");
  });
  test("mermas viejas sin motivo cuentan como rotura; motivo desconocido como otro", () => {
    assert.equal(causaPerdida({ productoId: "a", tipo: "rotura", cantidad: -1, referencia: null }), "rotura");
    assert.equal(causaPerdida({ productoId: "a", tipo: "rotura", cantidad: -1, referencia: "merma:zzz" }), "otro");
  });
  test("faltante de inventario: ajuste negativo con referencia del recuento", () => {
    assert.equal(causaPerdida({ productoId: "a", tipo: "ajuste", cantidad: -2, referencia: "inventario inv_1" }), "inventario");
  });
  test("no son perdidas: ventas, entradas, ajustes positivos o manuales", () => {
    assert.equal(causaPerdida({ productoId: "a", tipo: "venta", cantidad: -2 }), null);
    assert.equal(causaPerdida({ productoId: "a", tipo: "ajuste", cantidad: 5, referencia: "inventario inv_1" }), null);
    assert.equal(causaPerdida({ productoId: "a", tipo: "ajuste", cantidad: -5, referencia: null }), null);
    assert.equal(causaPerdida({ productoId: "a", tipo: "rotura", cantidad: 0 }), null);
  });
});

describe("resumenPerdidas", () => {
  test("valoriza a costo, agrupa por causa y marca lo sin costo", () => {
    const costos = new Map<string, number | undefined>([["a", 100], ["b", undefined]]);
    const r = resumenPerdidas(
      [
        { productoId: "a", tipo: "rotura", cantidad: -3, referencia: "merma:vencido" },
        { productoId: "a", tipo: "ajuste", cantidad: -2, referencia: "inventario inv_1" },
        { productoId: "b", tipo: "rotura", cantidad: -4, referencia: "merma:robo" },
        { productoId: "a", tipo: "venta", cantidad: -10 },
      ],
      costos,
    );
    assert.equal(r.total, 500);
    assert.equal(r.unidades, 9);
    assert.equal(r.sinCosto, 4);
    assert.deepEqual(r.porCausa.map((c) => [c.causa, c.unidades, c.valor]), [
      ["vencido", 3, 300],
      ["inventario", 2, 200],
      ["robo", 4, 0],
    ]);
  });
});
