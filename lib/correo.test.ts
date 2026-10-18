// lib/correo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { correoValido, explicarErrorCorreo, limpiarCodigo, normalizarCorreo, patronCorreoExacto } from "./correo.ts";

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

describe("entrar con código por correo", () => {
  test("normaliza y valida el correo", () => {
    assert.equal(normalizarCorreo("  Juan.Perez@Hotmail.com "), "juan.perez@hotmail.com");
    assert.equal(correoValido("juan@hotmail.com"), true);
    assert.equal(correoValido("juan@hotmail"), false);
    assert.equal(correoValido("juan hotmail.com"), false);
    assert.equal(correoValido(""), false);
  });

  test("el código queda solo con dígitos", () => {
    assert.equal(limpiarCodigo(" 123 456 "), "123456");
    assert.equal(limpiarCodigo("12-34-56"), "123456");
  });

  test("explica los errores de Supabase en castellano", () => {
    assert.match(explicarErrorCorreo("email rate limit exceeded"), /Esperá un minuto/);
    assert.match(explicarErrorCorreo("For security purposes, you can only request this after 42 seconds."), /Esperá un minuto/);
    assert.match(explicarErrorCorreo("Token has expired or is invalid"), /venció/);
    assert.match(explicarErrorCorreo("Unable to validate email address: invalid format"), /mal escrito/);
    assert.match(explicarErrorCorreo(undefined), /Probá de nuevo/);
  });
});
