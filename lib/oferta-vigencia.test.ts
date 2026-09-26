// lib/oferta-vigencia.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  estadoVigencia, ofertaVigente, presetsVigencia, sumarDias, textoVigencia, errorVigencia,
} from "./oferta-vigencia.ts";

describe("ofertaVigente", () => {
  test("sin fechas siempre esta vigente", () => {
    assert.equal(ofertaVigente(null, null, "2026-10-01"), true);
  });

  test("las fechas son inclusive", () => {
    assert.equal(ofertaVigente("2026-10-01", "2026-10-05", "2026-10-01"), true);
    assert.equal(ofertaVigente("2026-10-01", "2026-10-05", "2026-10-05"), true);
    assert.equal(ofertaVigente("2026-10-01", "2026-10-05", "2026-10-06"), false);
    assert.equal(ofertaVigente("2026-10-01", "2026-10-05", "2026-09-30"), false);
  });

  test("solo desde o solo hasta", () => {
    assert.equal(ofertaVigente("2026-10-03", null, "2026-12-31"), true);
    assert.equal(ofertaVigente(null, "2026-10-03", "2026-10-04"), false);
  });
});

describe("estadoVigencia", () => {
  test("distingue programada, vigente y vencida", () => {
    assert.equal(estadoVigencia(null, null, "2026-10-01"), "sin-fecha");
    assert.equal(estadoVigencia("2026-10-03", "2026-10-05", "2026-10-01"), "programada");
    assert.equal(estadoVigencia("2026-10-03", "2026-10-05", "2026-10-04"), "vigente");
    assert.equal(estadoVigencia("2026-10-03", "2026-10-05", "2026-10-06"), "vencida");
  });
});

describe("sumarDias", () => {
  test("cruza meses y años", () => {
    assert.equal(sumarDias("2026-09-28", 6), "2026-10-04");
    assert.equal(sumarDias("2026-12-30", 3), "2027-01-02");
  });
});

describe("presetsVigencia", () => {
  // 2026-09-30 es miercoles
  const ps = Object.fromEntries(presetsVigencia("2026-09-30").map((p) => [p.id, p]));

  test("este finde va de sabado a domingo", () => {
    assert.equal(ps.finde.desde, "2026-10-03");
    assert.equal(ps.finde.hasta, "2026-10-04");
  });

  test("7 dias incluye hoy", () => {
    assert.equal(ps["7d"].desde, "2026-09-30");
    assert.equal(ps["7d"].hasta, "2026-10-06");
  });

  test("hasta fin de mes", () => {
    assert.equal(ps.mes.hasta, "2026-09-30");
    assert.equal(presetsVigencia("2026-02-10").find((p) => p.id === "mes")?.hasta, "2026-02-28");
  });

  test("un domingo, el finde es solo hoy", () => {
    const domingo = presetsVigencia("2026-10-04").find((p) => p.id === "finde");
    assert.equal(domingo?.desde, "2026-10-04");
    assert.equal(domingo?.hasta, "2026-10-04");
  });
});

describe("textoVigencia", () => {
  test("arma el texto del cartel", () => {
    assert.equal(textoVigencia(null, null), "Válido hasta agotar stock");
    assert.equal(textoVigencia(null, "2026-10-05"), "Válido hasta el 5/10");
    assert.equal(textoVigencia("2026-10-03", null), "Válido desde el 3/10");
    assert.equal(textoVigencia("2026-10-03", "2026-10-05"), "Válido del 3/10 al 5/10");
    assert.equal(textoVigencia("2026-10-05", "2026-10-05"), "Válido solo el 5/10");
  });
});

describe("errorVigencia", () => {
  test("valida formato y orden", () => {
    assert.equal(errorVigencia(null, null), null);
    assert.equal(errorVigencia("2026-10-01", "2026-10-05"), null);
    assert.notEqual(errorVigencia("2026-10-06", "2026-10-05"), null);
    assert.notEqual(errorVigencia("01/10/2026", null), null);
  });
});
