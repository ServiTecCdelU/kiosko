// lib/produccion.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REFERENCIA_DESCARTE, REFERENCIA_PRODUCCION, diaArgentina, resumenPorProducto, totalesDelDia,
  type MovimientoProduccion,
} from "./produccion.ts";

// 18/10 a las 7 y a las 20 (hora argentina = UTC-3), y el 19/10 a la 1 de la mañana.
const MANIANA = "2026-10-18T10:00:00Z";
const NOCHE = "2026-10-18T23:00:00Z";
const MADRUGADA_SIG = "2026-10-19T04:00:00Z";

const mov = (productoId: string, tipo: string, cantidad: number, referencia: string | null, fecha = MANIANA): MovimientoProduccion =>
  ({ productoId, tipo, cantidad, referencia, fecha });

const movs: MovimientoProduccion[] = [
  mov("pan", "entrada", 20, REFERENCIA_PRODUCCION),
  mov("pan", "venta", -0.5, "venta_1"),
  mov("pan", "venta", -12.25, "venta_2", NOCHE),
  mov("pan", "devolucion", 0.25, "Anulacion venta 2", NOCHE),
  mov("pan", "rotura", -7.5, REFERENCIA_DESCARTE, NOCHE),
  mov("pan", "entrada", 50, "compra a proveedor"), // no es produccion
  mov("pan", "rotura", -1, "merma:rotura"), // merma comun, no sobrante
  mov("factura", "entrada", 24, REFERENCIA_PRODUCCION),
  mov("factura", "venta", -24, "venta_3"),
  mov("pan", "entrada", 18, REFERENCIA_PRODUCCION, MADRUGADA_SIG),
];

test("diaArgentina corta el dia en hora argentina", () => {
  assert.equal(diaArgentina(NOCHE), "2026-10-18");
  assert.equal(diaArgentina("2026-10-19T02:59:00Z"), "2026-10-18");
  assert.equal(diaArgentina(MADRUGADA_SIG), "2026-10-19");
});

describe("totalesDelDia", () => {
  const hoy = totalesDelDia(movs, "2026-10-18");
  test("producido, vendido (menos anulaciones) y descartado", () => {
    assert.deepEqual(hoy.get("pan"), { producido: 20, vendido: 12.5, descartado: 7.5 });
    assert.deepEqual(hoy.get("factura"), { producido: 24, vendido: 24, descartado: 0 });
  });
  test("la tanda del dia siguiente no cuenta", () => {
    assert.equal(totalesDelDia(movs, "2026-10-19").get("pan")?.producido, 18);
  });
});

test("resumenPorProducto: totales del periodo, lo que mas sobra primero", () => {
  const r = resumenPorProducto(movs);
  assert.equal(r[0].productoId, "pan");
  assert.equal(r[0].producido, 38);
  assert.equal(r[0].vendido, 12.5);
  assert.equal(r[0].pct, 19.7); // 7,5 de 38
  assert.equal(r[1].productoId, "factura");
  assert.equal(r[1].pct, 0);
});
