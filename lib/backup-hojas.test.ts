// lib/backup-hojas.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  HOJAS, valorCelda, filasDeHoja, filasDetalleVentas, nombreArchivoBackup, MAX_TEXTO_CELDA,
} from "./backup-hojas.ts";

describe("valorCelda", () => {
  test("una fecha con hora se muestra en horario argentino", () => {
    // 15:30 UTC = 12:30 en Argentina (UTC-3)
    assert.equal(valorCelda("2026-10-03T15:30:00Z", "fecha"), "03/10/2026 12:30");
  });

  test("un dia (sin hora) no se corre por el huso horario", () => {
    assert.equal(valorCelda("2026-10-03", "dia"), "03/10/2026");
  });

  test("si/no para booleanos", () => {
    assert.equal(valorCelda(true, "bool"), "Sí");
    assert.equal(valorCelda(false, "bool"), "No");
  });

  test("los numeros quedan numeros (para poder sumar en Excel)", () => {
    assert.equal(valorCelda("1500.50", "numero"), 1500.5);
    assert.equal(valorCelda(0, "numero"), 0);
  });

  test("vacio para null o undefined", () => {
    assert.equal(valorCelda(null, "texto"), "");
    assert.equal(valorCelda(undefined, "numero"), "");
    assert.equal(valorCelda(null, "fecha"), "");
  });

  test(`corta textos de mas de ${MAX_TEXTO_CELDA} caracteres (limite de Excel)`, () => {
    const largo = valorCelda("x".repeat(MAX_TEXTO_CELDA + 10), "texto");
    assert.equal(typeof largo === "string" && largo.length, MAX_TEXTO_CELDA);
  });
});

describe("HOJAS", () => {
  test("los nombres de hoja entran en el limite de Excel y no se repiten", () => {
    const nombres = HOJAS.map((h) => h.nombre);
    assert.equal(new Set(nombres).size, nombres.length);
    for (const n of nombres) assert.ok(n.length <= 31 && !/[\\/?*[\]:]/.test(n), n);
  });

  test("ninguna hoja exporta secretos", () => {
    const campos = HOJAS.flatMap((h) => h.columnas.map((c) => c.campo));
    for (const secreto of ["pin_hash", "mp_token_cifrado", "sale_input"]) {
      assert.ok(!campos.includes(secreto), secreto);
    }
  });
});

describe("filasDeHoja", () => {
  const productos = HOJAS.find((h) => h.tabla === "productos")!;

  test("primera fila = titulos, despues los datos en el mismo orden", () => {
    const filas = filasDeHoja(productos, [{ name: "Coca 1,5", price: 2500, disabled: false, codigo: "A1" }]);
    assert.deepEqual(filas[0], productos.columnas.map((c) => c.titulo));
    const i = productos.columnas.findIndex((c) => c.campo === "name");
    assert.equal(filas[1][i], "Coca 1,5");
  });

  test("ignora campos que no estan declarados (ej. un secreto que se cuele)", () => {
    const empleados = HOJAS.find((h) => h.tabla === "usuarios")!;
    const filas = filasDeHoja(empleados, [{ nombre: "Ana", pin_hash: "$2a$secreto" }]);
    assert.ok(!JSON.stringify(filas).includes("secreto"));
  });
});

describe("filasDetalleVentas", () => {
  test("una fila por producto vendido, con el numero de venta", () => {
    const filas = filasDetalleVentas([
      {
        sale_number: "V-0001", created_at: "2026-10-03T15:30:00Z", estado: "completada",
        items: [
          { productId: "p1", name: "Alfajor", quantity: 2, price: 800, subtotal: 1600 },
          { productId: "p2", name: "Agua", quantity: 1, price: 1200, subtotal: 1200 },
        ],
      },
    ]);
    assert.equal(filas.length, 3); // titulos + 2 items
    assert.equal(filas[1][0], "V-0001");
    assert.ok(filas[1].includes("Alfajor"));
    assert.ok(filas[2].includes(1200));
  });

  test("tolera ventas sin items o con items malformados", () => {
    const filas = filasDetalleVentas([{ sale_number: "V-1", items: null }, { sale_number: "V-2", items: "basura" }]);
    assert.equal(filas.length, 1); // solo titulos
  });
});

describe("nombreArchivoBackup", () => {
  test("lleva el slug y la fecha argentina", () => {
    assert.equal(nombreArchivoBackup("kiosco-el-sol", new Date("2026-10-04T01:00:00Z")), "backup-kiosco-el-sol-2026-10-03.xlsx");
  });
});
