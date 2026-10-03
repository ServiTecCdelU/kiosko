// lib/server/cifrado.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cifrar, descifrar, claveDesdeTexto } from "./cifrado.ts";

const clave = randomBytes(32);

describe("cifrado de secretos", () => {
  test("ida y vuelta devuelve el texto original", () => {
    const token = "APP_USR-1234567890-abcdef";
    assert.equal(descifrar(cifrar(token, clave), clave), token);
  });

  test("el texto cifrado no contiene el secreto", () => {
    const token = "APP_USR-secreto-que-no-se-ve";
    assert.ok(!cifrar(token, clave).includes("secreto"));
  });

  test("dos cifrados del mismo texto son distintos (iv aleatorio)", () => {
    assert.notEqual(cifrar("igual", clave), cifrar("igual", clave));
  });

  test("con otra clave no descifra", () => {
    const cifrado = cifrar("token", clave);
    assert.throws(() => descifrar(cifrado, randomBytes(32)));
  });

  test("detecta un texto cifrado adulterado", () => {
    const [v, iv, tag, datos] = cifrar("token", clave).split(":");
    const otro = Buffer.from(datos, "base64");
    otro[0] ^= 1;
    assert.throws(() => descifrar([v, iv, tag, otro.toString("base64")].join(":"), clave));
  });

  test("rechaza un formato desconocido", () => {
    assert.throws(() => descifrar("texto-plano", clave));
  });

  test("la clave tiene que ser de 32 bytes en base64", () => {
    assert.equal(claveDesdeTexto(clave.toString("base64")).length, 32);
    assert.throws(() => claveDesdeTexto(randomBytes(16).toString("base64")));
    assert.throws(() => claveDesdeTexto(""));
  });
});
