import { test } from "node:test";
import assert from "node:assert/strict";
import { coincideBusqueda, MAX_PALABRAS, normalizarBusqueda, palabrasBusqueda } from "./busqueda.ts";

const FILTRO = "Filtro de aceite Fram PH5949 VW Gol / Voyage 1.6";

test("varias palabras en cualquier orden", () => {
  assert.equal(coincideBusqueda(FILTRO, palabrasBusqueda("filtro gol")), true);
  assert.equal(coincideBusqueda(FILTRO, palabrasBusqueda("gol filtro 1.6")), true);
  assert.equal(coincideBusqueda(FILTRO, palabrasBusqueda("filtro corsa")), false);
});

test("sin importar tildes ni mayusculas", () => {
  assert.equal(coincideBusqueda("Bujía NGK BKR6E", palabrasBusqueda("bujia")), true);
  assert.equal(coincideBusqueda("Bujia NGK BKR6E", palabrasBusqueda("BUJÍA bkr6e")), true);
  assert.equal(normalizarBusqueda("Distribución Ñandú"), "distribucion nandu");
});

test("saca comodines y caracteres que rompen el filtro", () => {
  assert.deepEqual(palabrasBusqueda("  pastilla (gol), 100% "), ["pastilla", "gol", "100"]);
  assert.deepEqual(palabrasBusqueda("a_b\\c*"), ["a", "b", "c"]);
});

test("sin palabras no coincide nada y se acota la cantidad", () => {
  assert.deepEqual(palabrasBusqueda("  , ( ) "), []);
  assert.equal(coincideBusqueda(FILTRO, []), false);
  assert.equal(palabrasBusqueda("a b c d e f g h").length, MAX_PALABRAS);
  assert.deepEqual(palabrasBusqueda("gol Gol GOL"), ["gol"]);
});
