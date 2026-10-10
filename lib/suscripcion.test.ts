// lib/suscripcion.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { coberturaDelPago, descripcionPago, finDeMesArgentina, montoMensual, periodoDe, puedeSumarCaja, textoPeriodo } from "./suscripcion.ts";

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

describe("montoMensual y tope de cajas", () => {
  const basico = { precioMensual: 20000, cajasIncluidas: 1, precioCajaExtra: 0, maxCajas: 1 };
  const pro = { precioMensual: 40000, cajasIncluidas: 1, precioCajaExtra: 10000, maxCajas: null };
  test("Pro: 1 caja incluida, cada extra suma", () => {
    assert.deepEqual(montoMensual(pro, 1), { base: 40000, cajas: 1, cajasExtra: 0, extra: 0, total: 40000 });
    assert.deepEqual(montoMensual(pro, 3), { base: 40000, cajas: 3, cajasExtra: 2, extra: 20000, total: 60000 });
    assert.equal(montoMensual(pro, 0).total, 40000);
  });
  test("Basico: no cobra extra y no deja sumar cajas", () => {
    assert.equal(montoMensual(basico, 3).total, 20000);
    assert.equal(puedeSumarCaja(basico, 1), false);
    assert.equal(puedeSumarCaja(basico, 0), true);
    assert.equal(puedeSumarCaja(pro, 7), true);
  });
  test("descripcion con cajas extra", () => {
    assert.equal(descripcionPago("pro", "2026-10", "Súper", 2), "Suscripción Pro (+2 cajas) octubre 2026 · Súper");
  });
});

describe("textos", () => {
  test("periodo legible y descripcion del pago", () => {
    assert.equal(textoPeriodo("2026-10"), "octubre 2026");
    assert.equal(textoPeriodo("raro"), "raro");
    assert.equal(descripcionPago("pro", "2026-10", "Súper Ñandú"), "Suscripción Pro octubre 2026 · Súper Ñandú");
  });
});
