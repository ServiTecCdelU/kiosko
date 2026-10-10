// lib/inventario.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  progresoInventario, diferenciaItem, resumenDiferencias, buscarEnInventario, ordenarParaContar, type ItemInventario,
} from "./inventario.ts";

const items: ItemInventario[] = [
  { productoId: "a", nombre: "Yogur", codigoBarras: "779001", stockSistema: 10, contado: 8, costo: 500 },
  { productoId: "b", nombre: "Leche", codigoBarras: "779002", stockSistema: 5, contado: 5, costo: 900 },
  { productoId: "c", nombre: "Queso", stockSistema: 2, contado: 3 },
  { productoId: "d", nombre: "Manteca", codigoBarras: "779004", stockSistema: 7 },
];

describe("progresoInventario", () => {
  test("cuenta contados y pendientes", () => {
    assert.deepEqual(progresoInventario(items), { total: 4, contados: 3, pendientes: 1, porcentaje: 75 });
    assert.deepEqual(progresoInventario([]), { total: 0, contados: 0, pendientes: 0, porcentaje: 0 });
  });
});

describe("diferenciaItem", () => {
  test("contado menos sistema; null si no se conto", () => {
    assert.equal(diferenciaItem(items[0]), -2);
    assert.equal(diferenciaItem(items[1]), 0);
    assert.equal(diferenciaItem(items[2]), 1);
    assert.equal(diferenciaItem(items[3]), null);
  });
  test("soporta decimales (pesables) sin basura de coma flotante", () => {
    assert.equal(diferenciaItem({ productoId: "k", nombre: "Queso", stockSistema: 1.1, contado: 0.9 }), -0.2);
  });
});

describe("resumenDiferencias", () => {
  test("separa faltantes y sobrantes, valoriza a costo y marca lo que no tiene costo", () => {
    const r = resumenDiferencias(items);
    assert.equal(r.conDiferencia, 2);
    assert.equal(r.faltantes, 1);
    assert.equal(r.sobrantes, 1);
    assert.equal(r.unidadesFaltantes, 2);
    assert.equal(r.unidadesSobrantes, 1);
    assert.equal(r.valor, -1000);
    assert.equal(r.sinCosto, 1);
  });
});

describe("buscarEnInventario", () => {
  test("codigo exacto gana; si no, por nombre", () => {
    assert.deepEqual(buscarEnInventario(items, "779004").map((i) => i.productoId), ["d"]);
    assert.deepEqual(buscarEnInventario(items, "QUE").map((i) => i.productoId), ["c"]);
    assert.equal(buscarEnInventario(items, "", 2).length, 2);
    assert.deepEqual(buscarEnInventario(items, "nada"), []);
  });
});

describe("ordenarParaContar", () => {
  test("pendientes primero y despues alfabetico", () => {
    assert.deepEqual(ordenarParaContar(items).map((i) => i.productoId), ["d", "b", "c", "a"]);
  });
});
