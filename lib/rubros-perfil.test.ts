// lib/rubros-perfil.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PERFILES, perfilDeRubro, tipicosFaltantes } from "./rubros-perfil.ts";
import { RUBROS } from "./registro.ts";
import { esFraccionable, esUnidad } from "./unidades.ts";

describe("perfiles por rubro", () => {
  test("todo rubro del alta tiene perfil", () => {
    for (const r of RUBROS) assert.ok(PERFILES[r.id], r.id);
  });

  test("rubro desconocido o vacio cae en 'otro'", () => {
    assert.equal(perfilDeRubro("inventado"), PERFILES.otro);
    assert.equal(perfilDeRubro(null), PERFILES.otro);
  });

  test("panaderia: pan por kg y sin control de stock (el error de la prueba por rubro)", () => {
    const pan = PERFILES.panaderia.tipicos.find((t) => t.name === "Pan francés")!;
    assert.equal(pan.unidad, "kg");
    assert.equal(pan.stockControlado, false);
    assert.equal(PERFILES.panaderia.unidad, "kg");
  });

  test("kiosco: recargas a precio libre", () => {
    assert.ok(PERFILES.kiosco.tipicos.filter((t) => t.precioLibre).length >= 2);
  });

  test("ferreteria: cable por metro", () => {
    assert.ok(PERFILES.ferreteria.tipicos.some((t) => t.unidad === "m"));
  });

  test("los tipicos son validos: unidad conocida, nombres unicos, Varios con su codigo", () => {
    for (const [id, p] of Object.entries(PERFILES)) {
      const nombres = new Set<string>();
      for (const t of p.tipicos) {
        assert.ok(esUnidad(t.unidad), `${id}: ${t.name}`);
        assert.ok(!nombres.has(t.name), `${id}: ${t.name} repetido`);
        nombres.add(t.name);
        // Lo fraccionable con precio libre no tiene sentido (el importe es el total).
        assert.ok(!(t.precioLibre && esFraccionable(t.unidad)), `${id}: ${t.name}`);
      }
      const varios = p.tipicos.find((t) => t.name === "Varios");
      assert.ok(varios?.precioLibre && varios.codigo === "VARIOS", id);
    }
  });
});

test("tipicosFaltantes ignora mayusculas y acentos", () => {
  const faltan = tipicosFaltantes(PERFILES.panaderia, ["PAN FRANCES", "medialunas"]);
  assert.ok(!faltan.some((t) => t.name === "Pan francés"));
  assert.ok(!faltan.some((t) => t.name === "Medialunas"));
  assert.ok(faltan.some((t) => t.name === "Facturas"));
});
