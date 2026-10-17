import { test } from "node:test";
import assert from "node:assert/strict";
import { validarVisitaDemo } from "./demo.ts";

test("visita a la demo: limpia el telefono y el nombre", () => {
  const r = validarVisitaDemo({ nombre: "  Juan   Pérez ", telefono: "3442 12-3456", origen: "landing" });
  assert.deepEqual(r, { ok: true, datos: { nombre: "Juan Pérez", telefono: "3442123456", origen: "landing" } });
});

test("visita a la demo: pide nombre y WhatsApp", () => {
  assert.equal(validarVisitaDemo({ nombre: "J", telefono: "3442123456" }).ok, false);
  assert.equal(validarVisitaDemo({ nombre: "Juan", telefono: "123" }).ok, false);
  assert.equal(validarVisitaDemo(null).ok, false);
});

test("visita a la demo: origen desconocido cae en login", () => {
  const r = validarVisitaDemo({ nombre: "Juan", telefono: "+5493442123456", origen: "otro" });
  assert.ok(r.ok && r.datos.origen === "login");
});
