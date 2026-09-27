// lib/cartel-temas.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TEMAS_CARTEL, tamanoTitulo, temaCartel } from "./cartel-temas.ts";

describe("temaCartel", () => {
  test("devuelve el tema pedido", () => {
    assert.equal(temaCartel("hotsale").titulo, "HOT SALE");
  });

  test("un id desconocido o vacio cae en el clasico", () => {
    assert.equal(temaCartel("inventado").id, "clasico");
    assert.equal(temaCartel(null).id, "clasico");
  });

  test("los ids no se repiten", () => {
    assert.equal(new Set(TEMAS_CARTEL.map((t) => t.id)).size, TEMAS_CARTEL.length);
  });
});

describe("tamanoTitulo", () => {
  test("un titulo corto usa el maximo", () => {
    assert.equal(tamanoTitulo("¡OFERTA!", 36, 7), 7);
  });

  test("un titulo largo se achica para entrar", () => {
    const t = tamanoTitulo("¡OFERTA NAVIDEÑA!", 36, 7);
    assert.ok(t < 7);
    assert.ok(t * "¡OFERTA NAVIDEÑA!".length * 0.62 <= 36.0001);
  });
});
