// lib/registro.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validarRegistro } from "./registro.ts";

const valido = { nombreComercio: "Kiosco El Sol", nombre: "Ana Pérez", telefono: "+54 9 3442 123456", rubro: "kiosco" };

describe("validarRegistro", () => {
  test("acepta un alta completa y limpia los espacios", () => {
    const r = validarRegistro({ ...valido, nombreComercio: "  Kiosco El Sol  " });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.datos.nombreComercio, "Kiosco El Sol");
  });

  test("el telefono se guarda solo con digitos y +", () => {
    const r = validarRegistro({ ...valido, telefono: "(03442) 15-123456" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.datos.telefono, "0344215123456");
  });

  test("rechaza un telefono demasiado corto", () => {
    const r = validarRegistro({ ...valido, telefono: "1234" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /WhatsApp/);
  });

  test("rechaza un rubro que no esta en la lista", () => {
    assert.equal(validarRegistro({ ...valido, rubro: "casino" }).ok, false);
  });

  test("exige nombre del comercio y del dueño", () => {
    assert.equal(validarRegistro({ ...valido, nombreComercio: " " }).ok, false);
    assert.equal(validarRegistro({ ...valido, nombre: "" }).ok, false);
  });

  test("rechaza nombres absurdamente largos", () => {
    assert.equal(validarRegistro({ ...valido, nombreComercio: "x".repeat(81) }).ok, false);
  });

  test("tolera un body que no es un objeto", () => {
    assert.equal(validarRegistro(null).ok, false);
  });
});
