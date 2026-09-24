// lib/ean13-barcode.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checksumEAN13, generarBarrasEAN13 } from "./ean13-barcode.ts";

describe("checksumEAN13", () => {
  test("codigo real valido (ejemplo estandar EAN-13)", () => {
    assert.equal(checksumEAN13("5901234123457"), true);
  });

  test("digito verificador incorrecto", () => {
    assert.equal(checksumEAN13("5901234123456"), false);
  });

  test("largo invalido", () => {
    assert.equal(checksumEAN13("12345"), false);
    assert.equal(checksumEAN13(""), false);
  });

  test("caracteres no numericos", () => {
    assert.equal(checksumEAN13("590123412345X"), false);
  });
});

describe("generarBarrasEAN13", () => {
  test("codigo invalido devuelve null", () => {
    assert.equal(generarBarrasEAN13("5901234123456"), null);
    assert.equal(generarBarrasEAN13("123"), null);
  });

  test("las 95 columnas del patron suman siempre 95 modulos", () => {
    const barras = generarBarrasEAN13("5901234123457");
    assert.ok(barras);
    const total = barras!.reduce((s, b) => s + b.ancho, 0);
    assert.equal(total, 95);
  });

  test("patron completo para 0000000000000 (primer digito 0 => paridad LLLLLL)", () => {
    // Checksum: suma ponderada de doce ceros = 0 -> digito verificador 0.
    const barras = generarBarrasEAN13("0000000000000");
    assert.ok(barras);

    const guardaIzquierda = [
      { negra: true, ancho: 1 },
      { negra: false, ancho: 1 },
      { negra: true, ancho: 1 },
    ];
    // L_CODE['0'] = "0001101" -> runs: 000(blanco,3) 11(negro,2) 0(blanco,1) 1(negro,1)
    const digitoL0 = [
      { negra: false, ancho: 3 },
      { negra: true, ancho: 2 },
      { negra: false, ancho: 1 },
      { negra: true, ancho: 1 },
    ];
    const guardaCentral = [
      { negra: false, ancho: 1 },
      { negra: true, ancho: 1 },
      { negra: false, ancho: 1 },
      { negra: true, ancho: 1 },
      { negra: false, ancho: 1 },
    ];
    // R_CODE['0'] = "1110010" -> runs: 111(negro,3) 00(blanco,2) 1(negro,1) 0(blanco,1)
    const digitoR0 = [
      { negra: true, ancho: 3 },
      { negra: false, ancho: 2 },
      { negra: true, ancho: 1 },
      { negra: false, ancho: 1 },
    ];
    const guardaDerecha = [
      { negra: true, ancho: 1 },
      { negra: false, ancho: 1 },
      { negra: true, ancho: 1 },
    ];

    const esperado = [
      ...guardaIzquierda,
      ...digitoL0, ...digitoL0, ...digitoL0, ...digitoL0, ...digitoL0, ...digitoL0,
      ...guardaCentral,
      ...digitoR0, ...digitoR0, ...digitoR0, ...digitoR0, ...digitoR0, ...digitoR0,
      ...guardaDerecha,
    ];

    assert.deepEqual(barras, esperado);
    assert.equal(esperado.reduce((s, b) => s + b.ancho, 0), 95);
  });
});
