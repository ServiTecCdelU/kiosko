import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { analizarPedido, explicarPedido, sugerirPedidos, textoPedido, type RitmoProducto } from "./pedir-mas.ts";

const AHORA = new Date("2026-10-04T15:00:00Z");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

function prod(extra: Partial<RitmoProducto> = {}): RitmoProducto {
  return {
    id: "p1", nombre: "Coca-Cola 500ml", unidad: "un", stock: 100, stockMinimo: 0,
    vendidoReciente: 14, vendidoAnterior: 14, ultimaCompra: null, ...extra,
  };
}

describe("analizarPedido", () => {
  test("ritmo parejo y stock de sobra: no sugiere nada", () => {
    assert.equal(analizarPedido(prod(), 14, AHORA), null);
  });

  test("compraste 20 hace 4 dias y vendiste 16: pide mas, de a 20", () => {
    const s = analizarPedido(
      prod({ stock: 4, vendidoReciente: 20, vendidoAnterior: 10, ultimaCompra: { fecha: haceDias(4), cantidad: 20, vendidoDesde: 16 } }),
      14, AHORA,
    );
    assert.ok(s);
    assert.ok(s.motivos.includes("compra-rapida"));
    assert.ok(s.motivos.includes("acelera"));
    assert.equal(s.cuando, "ahora");
    assert.equal(s.diasDesdeCompra, 4);
    // ritmo 20/14 por dia * 14 = 20, tiene 4 -> faltan 16 -> 1 vez la compra de 20
    assert.equal(s.vecesUltimaCompra, 1);
    assert.equal(s.cantidad, 20);
  });

  test("redondea a multiplos de la ultima compra", () => {
    const s = analizarPedido(
      prod({ stock: 0, vendidoReciente: 70, vendidoAnterior: 30, ultimaCompra: { fecha: haceDias(3), cantidad: 24, vendidoDesde: 24 } }),
      14, AHORA,
    );
    assert.ok(s);
    // necesita 70 -> 3 compras de 24 = 72
    assert.equal(s.vecesUltimaCompra, 3);
    assert.equal(s.cantidad, 72);
  });

  test("acelera: +30% contra el periodo anterior", () => {
    const s = analizarPedido(prod({ stock: 10, vendidoReciente: 28, vendidoAnterior: 14 }), 14, AHORA);
    assert.ok(s);
    assert.deepEqual(s.motivos, ["acelera", "se-agota"]);
    assert.equal(s.cambioPct, 100);
    assert.equal(s.cantidad, 18); // 28 - 10
  });

  test("acelera pero tiene stock para mas de 2 semanas y sin compra de referencia: no sugiere", () => {
    assert.equal(analizarPedido(prod({ stock: 200, vendidoReciente: 28, vendidoAnterior: 14 }), 14, AHORA), null);
  });

  test("se vende bien y hay stock: la proxima vez pedi mas que la ultima compra", () => {
    // Caso demo: Coca 500ml, compro 36, vende 50 en 14 dias (antes 20), tiene 60
    const s = analizarPedido(
      prod({ stock: 60, vendidoReciente: 50, vendidoAnterior: 20, ultimaCompra: { fecha: haceDias(10), cantidad: 36, vendidoDesde: 28 } }),
      14, AHORA,
    );
    assert.ok(s);
    assert.equal(s.cuando, "proxima");
    assert.deepEqual(s.motivos, ["acelera", "compra-rapida"]);
    // 2 semanas de venta = 50 > 36 -> 2 compras de 36
    assert.equal(s.cantidad, 72);
    assert.equal(s.vecesUltimaCompra, 2);
  });

  test("se vende bien pero la ultima compra ya cubre 2 semanas: no sugiere", () => {
    const s = analizarPedido(
      prod({ stock: 60, vendidoReciente: 28, vendidoAnterior: 14, ultimaCompra: { fecha: haceDias(5), cantidad: 48, vendidoDesde: 30 } }),
      14, AHORA,
    );
    assert.equal(s, null);
  });

  test("sin ventas antes no cuenta como acelera (puede ser producto nuevo)", () => {
    const s = analizarPedido(prod({ stock: 2, vendidoReciente: 14, vendidoAnterior: 0 }), 14, AHORA);
    assert.ok(s);
    assert.deepEqual(s.motivos, ["se-agota"]);
    assert.equal(s.cambioPct, null);
  });

  test("vendio poco: es ruido, no sugiere", () => {
    assert.equal(analizarPedido(prod({ stock: 0, vendidoReciente: 3, vendidoAnterior: 1 }), 14, AHORA), null);
  });

  test("compra vieja (mas de 21 dias) no cuenta como compra rapida", () => {
    const s = analizarPedido(
      prod({ stock: 50, vendidoReciente: 14, vendidoAnterior: 14, ultimaCompra: { fecha: haceDias(30), cantidad: 20, vendidoDesde: 20 } }),
      14, AHORA,
    );
    assert.equal(s, null);
  });

  test("respeta el stock minimo", () => {
    const s = analizarPedido(prod({ stock: 3, stockMinimo: 30, vendidoReciente: 14, vendidoAnterior: 14 }), 14, AHORA);
    assert.ok(s);
    assert.equal(s.cantidad, 27); // minimo 30 > 14 dias de venta
  });

  test("por kilo redondea de a medio kilo", () => {
    const s = analizarPedido(prod({ unidad: "kg", stock: 1, vendidoReciente: 7.3, vendidoAnterior: 3 }), 14, AHORA);
    assert.ok(s);
    assert.equal(s.cantidad, 6.5); // 7.3 - 1 = 6.3 -> 6.5
  });

  test("stock negativo se toma como cero", () => {
    const s = analizarPedido(prod({ stock: -5, vendidoReciente: 14, vendidoAnterior: 14 }), 14, AHORA);
    assert.ok(s);
    assert.equal(s.cantidad, 14);
  });
});

describe("sugerirPedidos", () => {
  test("los de pedir ya van antes que los de la proxima vez", () => {
    const lista = sugerirPedidos(
      [
        prod({ id: "prox", stock: 60, vendidoReciente: 50, vendidoAnterior: 20, ultimaCompra: { fecha: haceDias(10), cantidad: 36, vendidoDesde: 28 } }),
        prod({ id: "ya", stock: 10, vendidoReciente: 28, vendidoAnterior: 14 }),
      ],
      14, AHORA,
    );
    assert.deepEqual(lista.map((s) => s.producto.id), ["ya", "prox"]);
  });

  test("lo que se agota antes va primero", () => {
    const lista = sugerirPedidos(
      [
        prod({ id: "a", nombre: "A", stock: 10, vendidoReciente: 28, vendidoAnterior: 14 }),
        prod({ id: "b", nombre: "B", stock: 1, vendidoReciente: 28, vendidoAnterior: 14 }),
        prod({ id: "c", nombre: "C" }),
      ],
      14, AHORA,
    );
    assert.deepEqual(lista.map((s) => s.producto.id), ["b", "a"]);
  });
});

describe("textos", () => {
  test("explica la compra rapida y la aceleracion", () => {
    const s = analizarPedido(
      prod({ stock: 4, vendidoReciente: 20, vendidoAnterior: 10, ultimaCompra: { fecha: haceDias(4), cantidad: 20, vendidoDesde: 16 } }),
      14, AHORA,
    );
    assert.ok(s);
    const t = explicarPedido(s);
    assert.equal(t[0], "De los 20 u. que compraste hace 4 días ya vendiste 16 u. (80%)");
    assert.equal(t[1], "Se vende un 100% más rápido que las 2 semanas anteriores");
    assert.equal(t[2], "Al ritmo de hoy te alcanza para 2 días");
  });

  test("si vendio mas de lo que compro no dice mas de 100%", () => {
    const s = analizarPedido(
      prod({ stock: 2, vendidoReciente: 21, vendidoAnterior: 16, ultimaCompra: { fecha: haceDias(11), cantidad: 12, vendidoDesde: 17 } }),
      14, AHORA,
    );
    assert.ok(s);
    assert.equal(explicarPedido(s)[0], "Desde que compraste 12 u. hace 11 días ya vendiste 17 u.: más de lo que compraste");
  });

  test("texto para el proveedor", () => {
    const s = analizarPedido(prod({ stock: 10, vendidoReciente: 28, vendidoAnterior: 14 }), 14, AHORA);
    assert.ok(s);
    assert.equal(textoPedido([s], "Despensa Don José"), "Pedido de Despensa Don José:\n• Coca-Cola 500ml: 18 u.");
  });
});
