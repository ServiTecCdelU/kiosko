// lib/server/leer-todo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { leerTodo } from "./leer-todo.ts";

/** Base simulada: `total` filas, y el servidor nunca devuelve mas de `tope` por pedido. */
function base(total: number, tope: number) {
  const filas = Array.from({ length: total }, (_, i) => ({ id: i }));
  let pedidos = 0;
  const pagina = (desde: number, hasta: number) => {
    pedidos++;
    const data = filas.slice(desde, Math.min(hasta + 1, desde + tope));
    return Promise.resolve({ data, error: null });
  };
  return { pagina, pedidos: () => pedidos };
}

describe("leerTodo", () => {
  test("lee mas de 1000 filas (el tope de PostgREST)", async () => {
    const b = base(2500, 1000);
    const filas = await leerTodo(b.pagina);
    assert.equal(filas.length, 2500);
    assert.deepEqual(filas.at(-1), { id: 2499 });
  });

  test("sale completo aunque el servidor tenga un tope MENOR a la pagina (sin saltear filas)", async () => {
    const filas = await leerTodo(base(50, 7).pagina);
    assert.deepEqual(filas.map((f) => f.id), Array.from({ length: 50 }, (_, i) => i));
  });

  test("tabla vacia", async () => {
    assert.deepEqual(await leerTodo(base(0, 1000).pagina), []);
  });

  test("respeta el maximo pedido", async () => {
    const filas = await leerTodo(base(5000, 1000).pagina, 1500);
    assert.equal(filas.length, 1500);
  });

  test("propaga el error de la base", async () => {
    await assert.rejects(
      leerTodo(() => Promise.resolve({ data: null, error: { message: "sin permiso" } })),
      /sin permiso/,
    );
  });
});
