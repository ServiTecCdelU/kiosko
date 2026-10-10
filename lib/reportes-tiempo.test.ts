// lib/reportes-tiempo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { momentoArgentina, agruparPorHora, agruparPorDiaSemana, horaPico, etiquetaHora } from "./reportes-tiempo.ts";

describe("momentoArgentina", () => {
  test("convierte UTC a hora argentina (UTC-3) con corte de dia correcto", () => {
    // 2026-10-10 es sabado. 23:30 UTC del viernes = 20:30 del viernes en Argentina.
    assert.deepEqual(momentoArgentina("2026-10-09T23:30:00Z"), { dia: "2026-10-09", hora: 20, diaSemana: 5 });
    // 02:00 UTC del sabado = 23:00 del viernes en Argentina.
    assert.deepEqual(momentoArgentina("2026-10-10T02:00:00Z"), { dia: "2026-10-09", hora: 23, diaSemana: 5 });
    // 03:00 UTC del sabado = 00:00 del sabado.
    assert.deepEqual(momentoArgentina("2026-10-10T03:00:00Z"), { dia: "2026-10-10", hora: 0, diaSemana: 6 });
  });
});

describe("agruparPorHora", () => {
  test("24 franjas, suma plata y cantidad en la hora argentina", () => {
    const r = agruparPorHora([
      { created_at: "2026-10-10T13:10:00Z", total: 100 },  // 10 hs
      { created_at: "2026-10-10T13:50:00Z", total: "50" }, // 10 hs
      { created_at: "2026-10-10T21:05:00Z", total: 700 },  // 18 hs
    ]);
    assert.equal(r.length, 24);
    assert.deepEqual(r[10], { hora: 10, total: 150, cantidad: 2 });
    assert.deepEqual(r[18], { hora: 18, total: 700, cantidad: 1 });
    assert.deepEqual(r[0], { hora: 0, total: 0, cantidad: 0 });
    assert.deepEqual(horaPico(r), { hora: 18, total: 700, cantidad: 1 });
    assert.equal(horaPico(agruparPorHora([])), null);
  });
});

describe("agruparPorDiaSemana", () => {
  test("7 dias con promedio por dia calendario", () => {
    const r = agruparPorDiaSemana([
      { created_at: "2026-10-05T15:00:00Z", total: 100 }, // lunes 5
      { created_at: "2026-10-05T16:00:00Z", total: 100 }, // lunes 5
      { created_at: "2026-10-12T15:00:00Z", total: 400 }, // lunes 12
      { created_at: "2026-10-10T15:00:00Z", total: 90 },  // sabado 10
    ]);
    assert.equal(r.length, 7);
    assert.equal(r[1].label, "Lunes");
    assert.equal(r[1].total, 600);
    assert.equal(r[1].cantidad, 3);
    assert.equal(r[1].promedio, 300);
    assert.equal(r[6].total, 90);
    assert.equal(r[0].promedio, 0);
  });
});

describe("etiquetaHora", () => {
  test("rango legible, la ultima vuelve a 0", () => {
    assert.equal(etiquetaHora(14), "14 a 15 hs");
    assert.equal(etiquetaHora(23), "23 a 0 hs");
  });
});
