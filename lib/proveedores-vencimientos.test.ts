// lib/proveedores-vencimientos.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { estadoPago, ordenarPorUrgencia, resumenPagos, textoPago } from "./proveedores-vencimientos.ts";

const HOY = "2026-10-10";

describe("estadoPago y textoPago", () => {
  test("clasifica por dias contra hoy", () => {
    assert.deepEqual(estadoPago("2026-10-07", HOY), { estado: "vencido", dias: -3 });
    assert.deepEqual(estadoPago("2026-10-10", HOY), { estado: "hoy", dias: 0 });
    assert.deepEqual(estadoPago("2026-10-17", HOY), { estado: "pronto", dias: 7 });
    assert.deepEqual(estadoPago("2026-10-18", HOY), { estado: "ok", dias: 8 });
    assert.deepEqual(estadoPago(null, HOY), { estado: "sin-fecha", dias: null });
    assert.deepEqual(estadoPago("basura", HOY), { estado: "sin-fecha", dias: null });
  });
  test("textos", () => {
    assert.equal(textoPago(estadoPago("2026-10-07", HOY)), "Venció hace 3 días");
    assert.equal(textoPago(estadoPago("2026-10-09", HOY)), "Venció ayer");
    assert.equal(textoPago(estadoPago("2026-10-10", HOY)), "Vence hoy");
    assert.equal(textoPago(estadoPago("2026-10-11", HOY)), "Vence mañana");
    assert.equal(textoPago(estadoPago("2026-10-15", HOY)), "Vence en 5 días");
    assert.equal(textoPago(estadoPago("2026-11-02", HOY), "2026-11-02"), "Vence el 02/11");
    assert.equal(textoPago(estadoPago(null, HOY)), null);
  });
  test("cruza meses y años sin problemas de huso", () => {
    assert.equal(estadoPago("2027-01-01", "2026-12-31").dias, 1);
    assert.equal(estadoPago("2026-03-01", "2026-02-28").dias, 1);
  });
});

describe("resumenPagos", () => {
  test("suma vencidas y proximas, cuenta sin fecha y trae la fecha mas cercana", () => {
    const r = resumenPagos([
      { id: "a", proveedorId: "p", saldo: 1000, vence: "2026-10-01" },
      { id: "b", proveedorId: "p", saldo: 500, vence: "2026-10-09" },
      { id: "c", proveedorId: "q", saldo: 300, vence: "2026-10-10" },
      { id: "d", proveedorId: "q", saldo: 200, vence: "2026-10-15" },
      { id: "e", proveedorId: "q", saldo: 900, vence: "2026-11-20" },
      { id: "f", proveedorId: "q", saldo: 50 },
      { id: "g", proveedorId: "q", saldo: 0, vence: "2026-10-01" },
    ], HOY);
    assert.deepEqual(r, { vencidas: 2, montoVencido: 1500, proximas: 2, montoProximo: 500, proximaFecha: "2026-10-01", sinFecha: 1 });
  });
  test("sin deuda, todo en cero", () => {
    assert.equal(resumenPagos([], HOY).proximaFecha, null);
  });
});

describe("ordenarPorUrgencia", () => {
  test("vencido primero, despues por fecha, sin fecha al final", () => {
    const r = ordenarPorUrgencia([
      { id: "ok", vence: "2026-11-01" }, { id: "sin" }, { id: "hoy", vence: HOY },
      { id: "vencida-nueva", vence: "2026-10-08" }, { id: "vencida-vieja", vence: "2026-09-01" }, { id: "pronto", vence: "2026-10-12" },
    ], HOY);
    assert.deepEqual(r.map((x) => x.id), ["vencida-vieja", "vencida-nueva", "hoy", "pronto", "ok", "sin"]);
  });
});
