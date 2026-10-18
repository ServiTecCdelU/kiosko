// lib/qendra.test.ts — correr con: npm test
// El formato sale del instructivo de Systel para importar en Qendra.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bytesQendra, codigoLibre, generarQendra, nombrePack, pluDe, precioQendra, textoCuora } from "./qendra.ts";

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

  test("codigo de PLU de 1 a 99997", () => {
    assert.equal(pluDe("105"), 105);
    assert.equal(pluDe("7054"), 7054);
    assert.equal(pluDe("0"), null);
    assert.equal(pluDe("99998"), null);
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

test("codigo de mas de 4000: va en la primera posicion libre de la balanza", () => {
  const r = generarQendra([
    { name: "Limon", codigo: "7051", price: 1000, unidad: "kg" },
    { name: "Pera", codigo: "1", price: 1500, unidad: "kg" },
    { name: "Kiwi", codigo: "7050", price: 3000, unidad: "kg" },
  ]);
  // Codigo de PLU (codigo de barras) y numero de PLU (posicion): 1 la ocupa Pera.
  assert.deepEqual(r.lineas.map((l) => l.split(";").slice(1, 4).filter((_, i) => i !== 1)), [["7051", "3"], ["1", "1"], ["7050", "2"]]);
});

describe("ofertas", () => {
  test("porcentaje y monto fijo van con el precio de oferta; un combo va a precio de lista y se avisa", () => {
    const r = generarQendra([
      { name: "Tomate", codigo: "7001", price: 2500, unidad: "kg", ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 20 },
      { name: "Papa", codigo: "7002", price: 900, unidad: "kg", ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 100 },
      { name: "Banana", codigo: "7008", price: 1800, unidad: "kg", ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 3000, ofertaCantidad: 2 },
      { name: "Cebolla", codigo: "7003", price: 1100, unidad: "kg", ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 10, ofertaHasta: "2000-01-01" },
    ]);
    assert.deepEqual(r.lineas.map((l) => l.split(";")[4]), ["2000,00", "800,00", "1800,00", "1100,00"]);
    assert.equal(r.conOferta, 2);
    assert.deepEqual(r.combos.map((c) => c.name), ["Banana"]);
  });
});

describe("combo como pack", () => {
  const banana = { id: "b", name: "Banana", codigo: "7008", price: 1800, unidad: "kg", ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 3000, ofertaCantidad: 2 };
  const pack = { id: "p", name: "Banana 2 kg oferta", codigo: "7009", price: 3000, unidad: "un", packDe: "b" };
  test("con el pack creado, el combo va a la balanza como producto por unidad y no se avisa", () => {
    const r = generarQendra([banana, pack]);
    assert.deepEqual(r.combos, []);
    assert.deepEqual(r.lineas, ["General;7008;Banana;4;1800,00;0,00;P;0;;", "General;7009;Banana 2 kg oferta;5;3000,00;0,00;U;0;;"].map((l) => l.replace(";4;", ";1;").replace(";5;", ";2;")));
  });
  test("sin pack se ofrece crearlo; con la oferta terminada el pack no va", () => {
    assert.deepEqual(generarQendra([banana]).combos.map((c) => [c.cantidad, c.valor]), [[2, 3000]]);
    const r = generarQendra([{ ...banana, ofertaActiva: false }, pack]);
    assert.equal(r.incluidos, 1);
    assert.match(r.omitidos[0].motivo, /no está vigente/);
  });
  test("nombre y codigo del pack", () => {
    assert.equal(nombrePack({ name: "Banana", cantidad: 2, unidad: "kg" }), "Banana 2 kg oferta");
    assert.equal(nombrePack({ name: "Palta", cantidad: 1.5, unidad: "kg" }), "Palta 1,5 kg oferta");
    assert.equal(codigoLibre(["7008", "7790001234567", null, "12"]), "7009");
  });
});

test("bytes en Windows-1252 con CRLF (la ñ como 0xF1)", () => {
  const b = bytesQendra(["Ñ;1;ñ;1;1,00;0,00;P;0;;"]);
  assert.equal(b[0], 0xd1);
  assert.equal(b[4], 0xf1);
  assert.deepEqual([...b.slice(-2)], [0x0d, 0x0a]);
});
