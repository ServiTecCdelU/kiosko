// lib/oferta-vencimiento.test.ts — correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sugerirDescuentoVencimiento, diasHastaVencimiento } from "./oferta-vencimiento.ts";

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

test("diasHastaVencimiento: mismo dia da 0", () => {
  const hoy = new Date(2026, 0, 15, 23, 0, 0);
  assert.equal(diasHastaVencimiento(new Date(2026, 0, 15), hoy), 0);
});

test("diasHastaVencimiento: mañana da 1", () => {
  const hoy = new Date(2026, 0, 15);
  assert.equal(diasHastaVencimiento(new Date(2026, 0, 16), hoy), 1);
});

test("diasHastaVencimiento: una fecha pasada da negativo", () => {
  const hoy = new Date(2026, 0, 15);
  assert.equal(diasHastaVencimiento(new Date(2026, 0, 10), hoy), -5);
});

test("diasHastaVencimiento: ignora la hora del dia, solo cuenta fechas calendario", () => {
  const hoy = new Date(2026, 0, 15, 8, 0, 0);
  const vencimiento = new Date(2026, 0, 16, 1, 0, 0);
  assert.equal(diasHastaVencimiento(vencimiento, hoy), 1);
});
