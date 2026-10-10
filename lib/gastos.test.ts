// lib/gastos.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { agruparGastos, esCategoriaGasto, labelCategoriaGasto } from "./gastos.ts";

describe("gastos por categoria", () => {
  test("valida y etiqueta categorias", () => {
    assert.equal(esCategoriaGasto("alquiler"), true);
    assert.equal(esCategoriaGasto("comida"), false);
    assert.equal(labelCategoriaGasto("sueldos"), "Sueldos");
    assert.equal(labelCategoriaGasto(null), "Sin categoría");
  });
  test("agrupa, suma y ordena; los viejos sin categoria van aparte", () => {
    const r = agruparGastos([
      { monto: 1000, categoria: "servicios" },
      { monto: "500", categoria: "servicios" },
      { monto: 20000, categoria: "alquiler" },
      { monto: 300, categoria: null },
      { monto: 200, categoria: "zzz" },
    ]);
    assert.deepEqual(r.map((g) => [g.label, g.total, g.cantidad]), [
      ["Alquiler", 20000, 1],
      ["Servicios", 1500, 2],
      ["Sin categoría", 500, 2],
    ]);
  });
});
