// lib/sync-filas.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filasDesdeDistribuidora, idProductoSync, derivarCodigo } from "./sync-filas.ts";

const catalogo = [
  { id: "prod_101", name: "Coca 1,5", price: 2500, codigoBarras: "7790895000997" },
  { id: "prod_mp_7", name: "Yerba 1kg", price: 6000 },
];
const AHORA = "2026-10-03T12:00:00.000Z";

describe("sincronizacion por comercio (SaaS)", () => {
  test("DOS COMERCIOS CON EL MISMO CATALOGO NUNCA COMPARTEN UN ID DE PRODUCTO", () => {
    const a = filasDesdeDistribuidora(catalogo, "comercio_aaa", AHORA);
    const b = filasDesdeDistribuidora(catalogo, "comercio_bbb", AHORA);
    const idsA = new Set(a.map((f) => f.id));
    assert.ok(b.every((f) => !idsA.has(f.id)));
  });

  test("cada fila queda marcada con SU comercio", () => {
    const filas = filasDesdeDistribuidora(catalogo, "comercio_aaa", AHORA);
    assert.ok(filas.every((f) => f.comercio_id === "comercio_aaa" && f.id.startsWith("comercio_aaa__")));
  });

  test("comercio_1 conserva los ids viejos (no duplica su catalogo)", () => {
    assert.equal(idProductoSync("comercio_1", "prod_101"), "prod_101");
    assert.equal(idProductoSync("comercio_aaa", "prod_101"), "comercio_aaa__prod_101");
  });

  test("ningun comercio puede generar el id legacy de comercio_1", () => {
    const filas = filasDesdeDistribuidora(catalogo, "comercio_aaa", AHORA);
    assert.ok(filas.every((f) => f.id !== f.dist_id));
  });

  test("nunca manda stock ni costo (son del kiosko)", () => {
    const [fila] = filasDesdeDistribuidora(catalogo, "comercio_aaa", AHORA);
    assert.ok(!("stock" in fila) && !("stock_minimo" in fila) && !("precio_base" in fila));
  });

  test("sin comercio no se sincroniza", () => {
    assert.throws(() => filasDesdeDistribuidora(catalogo, "", AHORA));
  });

  test("codigo derivado del id de la distribuidora", () => {
    assert.equal(derivarCodigo("prod_mp_7"), "7");
    assert.equal(derivarCodigo("prod_101"), "101");
    assert.equal(derivarCodigo("prod_101", "ABC"), "ABC");
  });
});
