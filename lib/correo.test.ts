// lib/correo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { patronCorreoExacto } from "./correo.ts";

describe("patronCorreoExacto", () => {
  test("un correo comun queda igual", () => {
    assert.equal(patronCorreoExacto("juan@gmail.com"), "juan@gmail.com");
  });

  test("escapa _ para que no matchee cualquier caracter", () => {
    assert.equal(patronCorreoExacto("j_hn@empresa.com"), "j\\_hn@empresa.com");
  });

  test("escapa % para que no matchee cualquier texto", () => {
    assert.equal(patronCorreoExacto("%@empresa.com"), "\\%@empresa.com");
  });

  test("escapa la barra invertida primero", () => {
    assert.equal(patronCorreoExacto("a\\b@x.com"), "a\\\\b@x.com");
  });
});
