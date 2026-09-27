// lib/recomendaciones.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ofertasPorTerminar, ofertasFlojas, productosSinCosto } from "./recomendaciones.ts";
import type { ResultadoOferta } from "./oferta-resultados.ts";

const HOY = "2026-09-27";
const oferta = (hasta?: string, extra = {}) => ({
  price: 1000, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 20, ofertaDesde: "2026-09-01", ofertaHasta: hasta, ...extra,
});
const resultado = (variacionPct: number | null): ResultadoOferta => ({
  desde: "2026-09-01", diasDurante: 10, unidadesDurante: 5, porDiaDurante: 0.5, facturadoDurante: 100,
  diasAntes: 14, unidadesAntes: 14, porDiaAntes: 1, variacionPct,
});

describe("ofertasPorTerminar", () => {
  test("incluye las que terminan hoy o dentro de la ventana, ordenadas por urgencia", () => {
    const r = ofertasPorTerminar([oferta("2026-09-29"), oferta("2026-09-27"), oferta("2026-10-10")], HOY);
    assert.deepEqual(r.map((x) => x.dias), [0, 2]);
  });

  test("ignora las sin fecha de fin, las ya vencidas y las apagadas", () => {
    const r = ofertasPorTerminar([oferta(undefined), oferta("2026-09-20"), oferta("2026-09-28", { ofertaActiva: false })], HOY);
    assert.equal(r.length, 0);
  });
});

describe("ofertasFlojas", () => {
  test("solo deja las vigentes cuyas ventas cayeron", () => {
    const r = ofertasFlojas(
      [
        { producto: oferta("2026-10-05"), resultado: resultado(-30) },
        { producto: oferta("2026-10-05"), resultado: resultado(50) },
        { producto: oferta("2026-10-05") },
        { producto: oferta("2026-09-20"), resultado: resultado(-30) },
      ],
      HOY,
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].resultado.variacionPct, -30);
  });
});

describe("productosSinCosto", () => {
  test("marca los que tienen stock y no tienen costo", () => {
    const base = { stock: 5, disabled: false, unidad: "un" as const };
    const r = productosSinCosto([
      { ...base, precioBase: undefined },
      { ...base, precioBase: 0 },
      { ...base, precioBase: 300 },
      { ...base, stock: 0 },
      { ...base, disabled: true },
    ]);
    assert.equal(r.length, 2);
  });
});
