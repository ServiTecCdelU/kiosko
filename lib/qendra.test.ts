// lib/qendra.test.ts — correr con: npm test
// El formato sale del instructivo de Systel para importar en Qendra.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bytesQendra, generarQendra, pluDe, precioQendra, textoCuora } from "./qendra.ts";

describe("formato Qendra", () => {
  test("la linea del ejemplo del instructivo", () => {
    const r = generarQendra([{ name: "Chorizo colorado", codigo: "105", price: 19, unidad: "kg", category: "Carniceria / Embutidos" }]);
    assert.deepEqual(r.lineas, ["Carniceria;105;Chorizo colorado;105;19,00;0,00;P;0;;"]);
  });

  test("por unidad va con U y la seccion puede ser fija", () => {
    const r = generarQendra([{ name: "Facturas", codigo: "20", price: 450.5, unidad: "un", category: "Panadería" }], "Panaderia");
    assert.deepEqual(r.lineas, ["Panaderia;20;Facturas;20;450,50;0,00;U;0;;"]);
  });

  test("textoCuora: sin acentos (salvo ñ), sin ';', hasta 18 caracteres", () => {
    assert.equal(textoCuora("Jamón cocido; feteado extra"), "Jamon cocido, fete");
    assert.equal(textoCuora("Ñoquis de papá"), "Ñoquis de papa");
    assert.equal(textoCuora("Pan — francés ★"), "Pan francés".normalize("NFD").replace(/[̀-ͯ]/g, ""));
  });

  test("precio con coma y dos decimales", () => {
    assert.equal(precioQendra(1234.5), "1234,50");
    assert.equal(precioQendra(0.1 + 0.2), "0,30");
  });

  test("PLU de 1 a 4000", () => {
    assert.equal(pluDe("105"), 105);
    assert.equal(pluDe("0"), null);
    assert.equal(pluDe("4001"), null);
    assert.equal(pluDe("7790001234567"), null);
    assert.equal(pluDe("A12"), null);
  });
});

describe("que entra y que no", () => {
  const r = generarQendra([
    { name: "Asado", codigo: "1", price: 9000, unidad: "kg", category: "Vaca" },
    { name: "Vacío", codigo: null, price: 9500, unidad: "kg", category: "Vaca" }, // por kg sin PLU: se avisa
    { name: "Yerba 1kg", codigo: "7790001234567", price: 3000, unidad: "un" }, // de gondola: no va, sin aviso
    { name: "Pollo", codigo: "1", price: 4000, unidad: "kg" }, // PLU repetido
    { name: "Matambre", codigo: "3", price: 0, unidad: "kg" }, // sin precio
    { name: "Viejo", codigo: "4", price: 100, unidad: "kg", disabled: true }, // desactivado: no va
  ]);
  test("solo los que tienen PLU, precio y no repiten", () => {
    assert.equal(r.incluidos, 1);
    assert.deepEqual(r.omitidos.map((o) => o.name), ["Vacío", "Pollo", "Matambre"]);
  });
});

test("bytes en Windows-1252 con CRLF (la ñ como 0xF1)", () => {
  const b = bytesQendra(["Ñ;1;ñ;1;1,00;0,00;P;0;;"]);
  assert.equal(b[0], 0xd1);
  assert.equal(b[4], 0xf1);
  assert.deepEqual([...b.slice(-2)], [0x0d, 0x0a]);
});
