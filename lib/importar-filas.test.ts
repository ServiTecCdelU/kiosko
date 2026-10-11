// lib/importar-filas.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { adivinarMapeo, CLIENTE_AUTO_MATCH, indexToLetter, letterToIndex, parsearClientes, parsearNumero } from "./importar-filas.ts";

describe("letras de columna", () => {
  test("ida y vuelta", () => {
    assert.equal(indexToLetter(0), "A");
    assert.equal(indexToLetter(25), "Z");
    assert.equal(indexToLetter(26), "AA");
    assert.equal(letterToIndex("AA"), 26);
    assert.equal(letterToIndex(undefined), -1);
  });
});

describe("parsearNumero", () => {
  test("formato argentino con miles y decimales", () => {
    assert.equal(parsearNumero("1.500,50"), 1500.5);
    assert.equal(parsearNumero("$ 1.500"), 1500);
    assert.equal(parsearNumero("12,5"), 12.5);
    assert.equal(parsearNumero("2.350.000"), 2350000);
  });

  test("formato Excel/ingles", () => {
    assert.equal(parsearNumero("1500.50"), 1500.5);
    assert.equal(parsearNumero("1,500,000"), 1500000);
    assert.equal(parsearNumero("1,500.25"), 1500.25);
    assert.equal(parsearNumero("12.50"), 12.5);
  });

  test("vacio, basura y negativos", () => {
    assert.equal(parsearNumero(""), null);
    assert.equal(parsearNumero("sin dato"), null);
    assert.equal(parsearNumero("-250"), -250);
    assert.equal(parsearNumero(80), 80);
  });
});

describe("parsearClientes", () => {
  const rows = [
    ["Nombre", "Celular", "DNI", "Debe", "Limite", "Obs"],
    ["Juan Pérez", "3442 123456", "30.123.456", "$ 1.500,50", "", "paga los viernes"],
    ["", "", "", "", "", ""],
    ["Ana", "12", "", "-20", "5000", ""],
    ["", "3442000000", "", "100", "", ""],
    ["juan perez", "3442123456", "", "0", "", ""],
  ];

  test("adivina el mapeo por encabezados", () => {
    const m = adivinarMapeo(rows[0], CLIENTE_AUTO_MATCH);
    assert.deepEqual(m, { nombre: "A", telefono: "B", documento: "C", saldo: "D", limite: "E", notas: "F" });
  });

  test("parsea deuda, limite y marca advertencias", () => {
    const m = adivinarMapeo(rows[0], CLIENTE_AUTO_MATCH);
    const r = parsearClientes(rows, m, 2);
    assert.equal(r.sinNombre, 1);
    assert.equal(r.filas.length, 3);
    const juan = r.filas[0];
    assert.equal(juan.nombre, "Juan Pérez");
    assert.equal(juan.documento, "30123456");
    assert.equal(juan.saldo, 1500.5);
    assert.equal(juan.limiteCredito, 0);
    assert.deepEqual(juan.warnings, []);
    const ana = r.filas[1];
    assert.equal(ana.saldo, 0);
    assert.equal(ana.limiteCredito, 5000);
    assert.ok(ana.warnings.includes("teléfono raro"));
    assert.ok(ana.warnings.includes("deuda negativa: se ignora"));
    // mismo telefono que Juan -> repetido
    assert.ok(r.filas[2].warnings.includes("repetido en el archivo"));
  });

  test("sin mapeo de nombre no importa nada", () => {
    const r = parsearClientes(rows, { telefono: "B" }, 2);
    assert.equal(r.filas.length, 0);
    assert.equal(r.sinNombre, 4);
  });
});
