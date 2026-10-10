// lib/afip/caea.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { caeaVigenteEn, inicioQuincena, quincenaDe, quincenaSiguiente, quincenasATener, sePuedePedir, textoQuincena } from "./caea.ts";

describe("quincenas", () => {
  test("quincena de una fecha", () => {
    assert.deepEqual(quincenaDe("2026-10-01"), { periodo: "202610", orden: 1 });
    assert.deepEqual(quincenaDe("2026-10-15"), { periodo: "202610", orden: 1 });
    assert.deepEqual(quincenaDe("2026-10-16"), { periodo: "202610", orden: 2 });
    assert.deepEqual(quincenaDe("2026-12-31T20:00:00"), { periodo: "202612", orden: 2 });
  });
  test("siguiente, con cambio de mes y de año", () => {
    assert.deepEqual(quincenaSiguiente({ periodo: "202610", orden: 1 }), { periodo: "202610", orden: 2 });
    assert.deepEqual(quincenaSiguiente({ periodo: "202610", orden: 2 }), { periodo: "202611", orden: 1 });
    assert.deepEqual(quincenaSiguiente({ periodo: "202612", orden: 2 }), { periodo: "202701", orden: 1 });
  });
  test("inicio y cuando se puede pedir (5 dias antes)", () => {
    assert.equal(inicioQuincena({ periodo: "202610", orden: 2 }), "2026-10-16");
    assert.equal(sePuedePedir({ periodo: "202610", orden: 2 }, "2026-10-10"), false);
    assert.equal(sePuedePedir({ periodo: "202610", orden: 2 }, "2026-10-11"), true);
    assert.equal(sePuedePedir({ periodo: "202611", orden: 1 }, "2026-10-27"), true);
    assert.equal(sePuedePedir({ periodo: "202611", orden: 1 }, "2026-10-26"), false);
  });
  test("que quincenas tener pedidas hoy", () => {
    assert.deepEqual(quincenasATener("2026-10-05"), [{ periodo: "202610", orden: 1 }]);
    assert.deepEqual(quincenasATener("2026-10-12"), [{ periodo: "202610", orden: 1 }, { periodo: "202610", orden: 2 }]);
  });
  test("vigencia y texto", () => {
    const c = { caea: "21234567890123", vigDesde: "2026-10-16", vigHasta: "2026-10-31", fchTopeInf: "2026-11-10" };
    assert.equal(caeaVigenteEn(c, "2026-10-20"), true);
    assert.equal(caeaVigenteEn(c, "2026-11-01"), false);
    assert.equal(textoQuincena({ periodo: "202610", orden: 2 }), "2ª quincena de octubre 2026");
  });
});
