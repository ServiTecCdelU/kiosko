// lib/server/ids.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generarIdLegible } from "./ids.ts";

describe("generarIdLegible", () => {
  test("dos comercios con un cliente que se llama igual: ids distintos y sin numero correlativo", async () => {
    const a = await generarIdLegible("clientes", "cli", "Juan Pérez");
    const b = await generarIdLegible("clientes", "cli", "Juan Pérez");
    assert.notEqual(a, b);
    assert.match(a, /^cli_juanperez_[0-9a-f]{10}$/);
  });
  test("cajas del mismo dia: no revela cuantas se abrieron en la plataforma", async () => {
    assert.match(await generarIdLegible("caja", "caja", "2026-10-03"), /^caja_20261003_[0-9a-f]{10}$/);
  });
  test("identificador sin letras: solo prefijo + aleatorio", async () => {
    assert.match(await generarIdLegible("clientes", "cli", "¡¡!!"), /^cli_[0-9a-f]{10}$/);
  });
});
