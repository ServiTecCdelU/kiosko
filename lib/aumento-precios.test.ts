// lib/aumento-precios.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { alcanzaAumento, enRubro, errorPorcentaje, nuevoPrecio, rubrosPrincipales } from "./aumento-precios.ts";

describe("nuevoPrecio", () => {
  test("10% a centavos", () => {
    assert.equal(nuevoPrecio(1000, 10, 0), 1100);
    assert.equal(nuevoPrecio(999, 7.5, 0), 1073.93);
  });
  test("redondea hacia arriba al multiplo", () => {
    assert.equal(nuevoPrecio(1122, 10, 50), 1250); // 1234,2 -> 1250
    assert.equal(nuevoPrecio(1000, 10, 100), 1100); // ya es multiplo: no sube de mas
    assert.equal(nuevoPrecio(1001, 0.5, 10), 1010);
  });
  test("rebaja", () => {
    assert.equal(nuevoPrecio(1000, -20, 0), 800);
  });
});

describe("enRubro / alcanzaAumento", () => {
  test("un rubro abarca sus subrubros pero no otro que empiece igual", () => {
    assert.equal(enRubro("Almacén / Galletitas", "Almacén"), true);
    assert.equal(enRubro("Almacén", "Almacén"), true);
    assert.equal(enRubro("Almacenamiento", "Almacén"), false);
    assert.equal(enRubro("Bebidas", null), true);
  });
  test("deja afuera precio libre, sin precio y deshabilitados", () => {
    assert.equal(alcanzaAumento({ price: 100 }, null), true);
    assert.equal(alcanzaAumento({ price: 0 }, null), false);
    assert.equal(alcanzaAumento({ price: 100, precioLibre: true }, null), false);
    assert.equal(alcanzaAumento({ price: 100, disabled: true }, null), false);
  });
});

test("errorPorcentaje", () => {
  assert.equal(errorPorcentaje(15), null);
  assert.equal(errorPorcentaje(-10), null);
  assert.ok(errorPorcentaje(0));
  assert.ok(errorPorcentaje(-95));
  assert.ok(errorPorcentaje(600));
  assert.ok(errorPorcentaje(NaN));
});

test("rubrosPrincipales", () => {
  assert.deepEqual(
    rubrosPrincipales(["Almacén / Galletitas", "Bebidas", "Almacén / Yerbas", "", null]),
    ["Almacén", "Bebidas"],
  );
});
