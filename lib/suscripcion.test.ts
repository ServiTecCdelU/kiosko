// lib/suscripcion.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { coberturaDelPago, descripcionPago, finDeMesArgentina, periodoDe, textoPeriodo } from "./suscripcion.ts";

describe("periodos y fin de mes en hora argentina", () => {
  test("periodo y fin de mes", () => {
    assert.equal(periodoDe("2026-10-10T12:00:00Z"), "2026-10");
    // 31/10 23:59:59 -03:00 = 01/11 02:59:59 UTC
    assert.equal(finDeMesArgentina("2026-10-10T12:00:00Z"), "2026-11-01T02:59:59.000Z");
    assert.equal(finDeMesArgentina("2026-12-05T12:00:00Z"), "2027-01-01T02:59:59.000Z");
  });
  test("a las 01:00 UTC del 1 todavia es el mes anterior en Argentina", () => {
    assert.equal(periodoDe("2026-11-01T01:00:00Z"), "2026-10");
  });
});

describe("coberturaDelPago", () => {
  const ahora = new Date("2026-10-10T15:00:00Z");
  test("sin suscripcion o vencida: cubre el mes actual", () => {
    assert.deepEqual(coberturaDelPago(null, ahora), { periodo: "2026-10", hasta: "2026-11-01T02:59:59.000Z" });
    assert.deepEqual(coberturaDelPago("2026-10-01T02:59:59.000Z", ahora), { periodo: "2026-10", hasta: "2026-11-01T02:59:59.000Z" });
  });
  test("al dia: cubre el mes siguiente al pagado", () => {
    assert.deepEqual(coberturaDelPago("2026-11-01T02:59:59.000Z", ahora), { periodo: "2026-11", hasta: "2026-12-01T02:59:59.000Z" });
    assert.deepEqual(coberturaDelPago("2027-01-01T02:59:59.000Z", ahora), { periodo: "2027-01", hasta: "2027-02-01T02:59:59.000Z" });
  });
});

describe("textos", () => {
  test("periodo legible y descripcion del pago", () => {
    assert.equal(textoPeriodo("2026-10"), "octubre 2026");
    assert.equal(textoPeriodo("raro"), "raro");
    assert.equal(descripcionPago("pro", "2026-10", "Súper Ñandú"), "Suscripción Pro octubre 2026 · Súper Ñandú");
  });
});
