// lib/oferta-vencimiento.test.ts — correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sugerirDescuentoVencimiento } from "./oferta-vencimiento.ts";

test("sugiere 40% si vence hoy o mañana", () => {
  assert.equal(sugerirDescuentoVencimiento(0), 40);
  assert.equal(sugerirDescuentoVencimiento(1), 40);
});

test("sugiere 25% si vence en 2 o 3 dias", () => {
  assert.equal(sugerirDescuentoVencimiento(2), 25);
  assert.equal(sugerirDescuentoVencimiento(3), 25);
});

test("sugiere 15% si vence en 4 a 7 dias", () => {
  assert.equal(sugerirDescuentoVencimiento(4), 15);
  assert.equal(sugerirDescuentoVencimiento(7), 15);
});

test("no sugiere nada si faltan mas de 7 dias", () => {
  assert.equal(sugerirDescuentoVencimiento(8), null);
});

test("no sugiere nada si ya vencio (dias negativos) -- se maneja aparte", () => {
  assert.equal(sugerirDescuentoVencimiento(-1), 40);
});
