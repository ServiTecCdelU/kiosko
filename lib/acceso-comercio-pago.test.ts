// lib/acceso-comercio-pago.test.ts — bloqueo por falta de pago (billing, 49).
// Correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluarAcceso, esLectura, esMotivoDePago, DIAS_AVISO, DIAS_GRACIA_PAGO } from "./acceso-comercio.ts";

const DIA = 86_400_000;
const ahora = new Date("2026-10-15T15:00:00Z");
const en = (dias: number) => new Date(ahora.getTime() + dias * DIA).toISOString();
const activo = (suscripcion_hasta: string | null, precio_mensual: number | null = 15000) =>
  ({ estado: "activo", trial_hasta: null, suscripcion_hasta, precio_mensual });

describe("evaluarAcceso con suscripcion paga", () => {
  test("al dia y lejos del vencimiento: ok", () => {
    assert.equal(evaluarAcceso(activo(en(20)), ahora).motivo, "ok");
  });
  test(`los ultimos ${DIAS_AVISO} dias avisa`, () => {
    const r = evaluarAcceso(activo(en(2.2)), ahora);
    assert.equal(r.motivo, "pago_por_vencer");
    assert.equal(r.nivel, "completo");
    assert.equal(r.dias, 3);
  });
  test(`vencida: ${DIAS_GRACIA_PAGO} dias de gracia con acceso completo`, () => {
    const r = evaluarAcceso(activo(en(-1)), ahora);
    assert.equal(r.motivo, "pago_en_gracia");
    assert.equal(r.nivel, "completo");
    assert.equal(r.dias, DIAS_GRACIA_PAGO - 1);
  });
  test("pasada la gracia: solo lectura por pago vencido", () => {
    const r = evaluarAcceso(activo(en(-DIAS_GRACIA_PAGO - 0.5)), ahora);
    assert.equal(r.nivel, "solo_lectura");
    assert.equal(r.motivo, "pago_vencido");
    assert.ok(esMotivoDePago(r.motivo));
  });
  test("sin precio (plan free o precio 0) nunca bloquea", () => {
    assert.equal(evaluarAcceso(activo(en(-60), 0), ahora).motivo, "ok");
    assert.equal(evaluarAcceso(activo(en(-60), null), ahora).motivo, "ok");
  });
  test("activo sin fecha cargada: acceso completo (lo activo el superadmin sin cobrar)", () => {
    assert.equal(evaluarAcceso(activo(null), ahora).motivo, "ok");
  });
  test("en prueba manda la prueba, no la suscripcion", () => {
    const r = evaluarAcceso({ estado: "prueba", trial_hasta: en(2), suscripcion_hasta: en(-60), precio_mensual: 15000 }, ahora);
    assert.equal(r.motivo, "prueba_por_vencer");
  });
  test("suspendido gana aunque este pago", () => {
    assert.equal(evaluarAcceso({ ...activo(en(30)), estado: "suspendido" }, ahora).motivo, "suspendido");
  });
});

describe("esLectura y billing", () => {
  test("pagar la suscripcion pasa aunque el comercio este en solo lectura", () => {
    assert.equal(esLectura("/api/billing/pagar", "POST"), true);
    assert.equal(esLectura("/api/billing", "GET"), true);
    assert.equal(esLectura("/api/billing/debito", "POST"), true);
    assert.equal(esLectura("/api/billing/debito", "DELETE"), true);
  });
});
