// lib/offline/cola.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { procesarCola, clasificarError, totalPendiente, esErrorDeCaja, type VentaPendiente } from "./cola.ts";

function error(nombre: string, mensaje = nombre): Error {
  const e = new Error(mensaje);
  e.name = nombre;
  return e;
}

function venta(id: string, minuto: number, extra: Partial<VentaPendiente> = {}): VentaPendiente {
  return {
    id,
    createdAt: `2026-10-03T12:${String(minuto).padStart(2, "0")}:00.000Z`,
    input: { items: [{ productId: "p", quantity: 2, price: 500 }], paymentMethod: "efectivo", cashAmount: 1000, changeAmount: 0 } as VentaPendiente["input"],
    ...extra,
  };
}

/** Cola en memoria que registra lo que pasa. */
function cola(respuestas: Record<string, Error | "ok">) {
  const quitadas: string[] = [];
  const marcadas: Record<string, string> = {};
  const enviadas: string[] = [];
  const deps = {
    enviar: async (v: VentaPendiente) => {
      enviadas.push(v.id);
      const r = respuestas[v.id] ?? "ok";
      if (r !== "ok") throw r;
    },
    quitar: async (id: string) => void quitadas.push(id),
    marcarError: async (id: string, motivo: string) => void (marcadas[id] = motivo),
  };
  return { deps, quitadas, marcadas, enviadas };
}

describe("procesarCola", () => {
  test("envia en orden cronologico y quita las sincronizadas", async () => {
    const c = cola({});
    const r = await procesarCola([venta("b", 2), venta("a", 1)], c.deps);
    assert.deepEqual(c.enviadas, ["a", "b"]);
    assert.deepEqual(c.quitadas, ["a", "b"]);
    assert.equal(r.sincronizadas, 2);
    assert.equal(r.frenoPor, null);
  });

  test("UNA VENTA RECHAZADA NUNCA SE BORRA: queda marcada con el motivo y se sigue con las demas", async () => {
    const c = cola({ a: error("Error", "La caja x no esta abierta en este comercio") });
    const r = await procesarCola([venta("a", 1), venta("b", 2)], c.deps);
    assert.ok(!c.quitadas.includes("a"));
    assert.equal(c.marcadas.a, "La caja x no esta abierta en este comercio");
    assert.deepEqual(c.quitadas, ["b"]);
    assert.equal(r.rechazadas, 1);
    assert.equal(r.sincronizadas, 1);
  });

  test("sin red: frena sin tocar nada (ni quitar ni marcar)", async () => {
    const c = cola({ a: error("NetworkUnavailableError", "Sin conexión") });
    const r = await procesarCola([venta("a", 1), venta("b", 2)], c.deps);
    assert.equal(r.frenoPor, "sin_red");
    assert.deepEqual(c.enviadas, ["a"]);
    assert.deepEqual(c.quitadas, []);
    assert.deepEqual(c.marcadas, {});
  });

  test("sesion vencida / modo consulta / servidor caido: frena y conserva", async () => {
    const c = cola({ b: error("VentaRetenidaError", "Tu sesion vencio") });
    const r = await procesarCola([venta("a", 1), venta("b", 2), venta("c", 3)], c.deps);
    assert.equal(r.frenoPor, "retenida");
    assert.deepEqual(c.quitadas, ["a"]);
    assert.deepEqual(c.marcadas, {});
  });

  test("las que ya tienen error no se reintentan solas", async () => {
    const c = cola({});
    await procesarCola([venta("a", 1, { error: "Stock insuficiente" }), venta("b", 2)], c.deps);
    assert.deepEqual(c.enviadas, ["b"]);
  });
});

describe("utilidades", () => {
  test("clasificarError por nombre", () => {
    assert.equal(clasificarError(error("NetworkUnavailableError")), "sin_red");
    assert.equal(clasificarError(error("VentaRetenidaError")), "retenida");
    assert.equal(clasificarError(new Error("Stock insuficiente")), "rechazada");
    assert.equal(clasificarError("raro"), "rechazada");
  });

  test("total con descuento", () => {
    assert.equal(totalPendiente(venta("a", 1, { input: { ...venta("a", 1).input, discount: 100 } })), 900);
  });

  test("reconoce el rechazo por caja cerrada (para ofrecer pasarla a la caja actual)", () => {
    assert.equal(esErrorDeCaja("La caja caja_1 no esta abierta en este comercio"), true);
    assert.equal(esErrorDeCaja('Stock insuficiente para "Coca"'), false);
    assert.equal(esErrorDeCaja(null), false);
  });
});
