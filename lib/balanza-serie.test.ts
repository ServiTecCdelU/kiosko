// lib/balanza-serie.test.ts — correr con: npm test
// Los ejemplos de Systel salen del manual "Comunicacion serial equipos Systel Rev 10".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { leerTrama, textoAKg } from "./balanza-serie.ts";

const bytes = (...xs: (number | string)[]) =>
  xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x]));

describe("textoAKg", () => {
  test("sin separador son gramos; con coma o punto, kg", () => {
    assert.equal(textoAKg("000710"), 0.71);
    assert.equal(textoAKg("000,075"), 0.075);
    assert.equal(textoAKg(" 1.250 kg"), 1.25);
    assert.equal(textoAKg("-001.250"), -1.25);
    assert.equal(textoAKg("sin numero"), null);
  });
  test("decimales configurables para numeros sin separador", () => {
    assert.equal(textoAKg("01234", 3), 1.234);
    assert.equal(textoAKg("1234", 2), 12.34);
  });
});

describe("Systel A ($05)", () => {
  test("710 g del manual: $02 000710 $03 $07", () => {
    assert.deepEqual(leerTrama(bytes(0x02, "000710", 0x03, 0x07), "systel-a"), { tipo: "peso", kg: 0.71, estable: true });
  });
  test("visor con coma y CR LF al final (captura del manual)", () => {
    assert.deepEqual(
      leerTrama(bytes(0x02, "000,075", 0x03, 0x2f, 0x0d, 0x0a), "systel-a"),
      { tipo: "peso", kg: 0.075, estable: true },
    );
  });
  test("$11: peso inestable", () => {
    assert.deepEqual(leerTrama(bytes(0x11), "systel-a"), { tipo: "inestable" });
  });
  test("verificacion mal: error; trama cortada: seguir leyendo", () => {
    assert.equal(leerTrama(bytes(0x02, "000710", 0x03, 0x08), "systel-a").tipo, "error");
    assert.equal(leerTrama(bytes(0x02, "0007"), "systel-a").tipo, "nada");
  });
});

describe("Systel B ($07)", () => {
  test("225 g estable del manual: 000225e + verificacion 96", () => {
    assert.deepEqual(leerTrama(bytes("000225e", 96), "systel-b"), { tipo: "peso", kg: 0.225, estable: true });
  });
  test("'i': inestable", () => {
    const x = [..."000225i"].reduce((a, c) => a ^ c.charCodeAt(0), 0);
    assert.deepEqual(leerTrama(bytes("000225i", x), "systel-b"), { tipo: "inestable" });
  });
});

describe("Torrey / Kretz (P) y CAS (W)", () => {
  test("torrey: CR adelante y peso con punto", () => {
    assert.deepEqual(leerTrama(bytes(0x0d, "001.250"), "torrey"), { tipo: "peso", kg: 1.25, estable: true });
  });
  test("CAS: STX + 01234 + CR del manual", () => {
    assert.deepEqual(leerTrama(bytes(0x02, "01234", 0x0d), "cas"), { tipo: "peso", kg: 1.234, estable: true });
  });
});

describe("continuo", () => {
  test("usa la ultima linea completa, no la que esta llegando", () => {
    assert.deepEqual(leerTrama(bytes("0.500\r\n0.520\r\n0.5"), "continuo"), { tipo: "peso", kg: 0.52, estable: true });
  });
  test("marca US: inestable", () => {
    assert.deepEqual(leerTrama(bytes("US,GS, 0.520kg\r\n"), "continuo"), { tipo: "inestable" });
  });
  test("nada completo todavia", () => {
    assert.deepEqual(leerTrama(bytes("0.5"), "continuo"), { tipo: "nada" });
  });
});
