// lib/oferta-vencimiento.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sugerirDescuentoVencimiento, diasHastaVencimiento, fechaDeDia, textoVencimiento } from "./oferta-vencimiento.ts";

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

// Bug 2026-10-04: la base guarda "2026-10-10" (solo dia) y new Date() lo toma
// como medianoche UTC = 9/10 21 hs en Argentina: se contaba un dia de menos.
describe("fechaDeDia (fecha sin hora de la base)", () => {
  test("en Argentina, '2026-10-10' es el 10 y no el 9", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Argentina/Buenos_Aires";
    try {
      const f = fechaDeDia("2026-10-10")!;
      assert.equal(f.getDate(), 10);
      assert.equal(diasHastaVencimiento(f, new Date(2026, 9, 4, 15, 0)), 6);
      // y al volver a texto (lo que usa el dialogo de edicion) sigue siendo el mismo dia
      assert.equal(f.toISOString().slice(0, 10), "2026-10-10");
    } finally {
      process.env.TZ = tz;
    }
  });

  test("acepta tambien el timestamp completo y vacio", () => {
    assert.equal(fechaDeDia("2026-10-10T00:00:00+00:00")!.getDate(), 10);
    assert.equal(fechaDeDia(null), undefined);
    assert.equal(fechaDeDia(""), undefined);
  });
});

describe("textoVencimiento", () => {
  test("cada caso en criollo", () => {
    assert.equal(textoVencimiento(-1), "Vencido ayer");
    assert.equal(textoVencimiento(-3), "Vencido hace 3 días");
    assert.equal(textoVencimiento(0), "Vence hoy");
    assert.equal(textoVencimiento(1), "Vence mañana");
    assert.equal(textoVencimiento(5), "Vence en 5 días");
  });
  test("mas de una semana: sin etiqueta (no es urgente)", () => {
    assert.equal(textoVencimiento(8), null);
  });
});
