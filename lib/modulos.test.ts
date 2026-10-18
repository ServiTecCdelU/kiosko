// lib/modulos.test.ts — correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { moduloActivo, modulosValidos } from "./modulos.ts";

test("el rubro decide de entrada", () => {
  assert.equal(moduloActivo("produccion", "verduleria"), false);
  assert.equal(moduloActivo("produccion", "panaderia"), true);
  assert.equal(moduloActivo("presupuestos", "kiosco"), false);
  assert.equal(moduloActivo("presupuestos", "ferreteria"), true);
  assert.equal(moduloActivo("balanza", "ferreteria"), false);
  assert.equal(moduloActivo("balanza", "verduleria"), true);
});

test("sin rubro u 'otro': todo prendido", () => {
  assert.equal(moduloActivo("produccion", undefined), true);
  assert.equal(moduloActivo("presupuestos", "otro"), true);
});

test("lo que elige el dueño le gana al rubro", () => {
  assert.equal(moduloActivo("presupuestos", "verduleria", { presupuestos: true }), true);
  assert.equal(moduloActivo("produccion", "panaderia", { produccion: false }), false);
});

test("modulosValidos descarta lo desconocido", () => {
  assert.deepEqual(modulosValidos({ produccion: false, caja: false, balanza: "si", presupuestos: true }), { produccion: false, presupuestos: true });
  assert.deepEqual(modulosValidos(null), {});
});
