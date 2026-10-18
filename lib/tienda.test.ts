// lib/tienda.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { configTiendaValida, mensajePedido, numeroWhatsapp, totalPedido, urlWhatsapp } from "./tienda.ts";

describe("numeroWhatsapp", () => {
  test("celulares argentinos en cualquier formato", () => {
    assert.equal(numeroWhatsapp("0343 15-456 7890"), "5493434567890");
    assert.equal(numeroWhatsapp("343 456-7890"), "5493434567890");
    assert.equal(numeroWhatsapp("+54 9 343 4567890"), "5493434567890");
    assert.equal(numeroWhatsapp("54 343 4567890"), "5493434567890");
    assert.equal(numeroWhatsapp("011 15 1234 5678"), "5491112345678");
    assert.equal(numeroWhatsapp("3442 15 456789"), "5493442456789");
  });
  test("incompletos o vacios: null", () => {
    assert.equal(numeroWhatsapp(""), null);
    assert.equal(numeroWhatsapp("4567890"), null);
  });
  test("otro pais con +", () => {
    assert.equal(numeroWhatsapp("+598 99 123 456"), "59899123456");
  });
});

test("mensaje del pedido: cantidades, total aproximado, entrega y pago", () => {
  const items = [
    { nombre: "Yerba 1kg", cantidad: 2, unidad: "un", precio: 3000 },
    { nombre: "Tomate", cantidad: 1.5, unidad: "kg", precio: 1920 },
  ];
  assert.equal(totalPedido(items), 8880);
  const m = mensajePedido("Despensa Ana", items, {
    nombre: "Juan", entrega: "envio", direccion: "San Martín 123", pago: "transferencia", nota: "Timbre B",
  });
  assert.equal(m, [
    "Hola Despensa Ana! Quiero hacer este pedido:",
    "",
    "• 2 x Yerba 1kg — $6.000",
    "• 1,5 kg Tomate — $2.880",
    "",
    "Total aproximado: $8.880",
    "",
    "Nombre: Juan",
    "Envío a: San Martín 123",
    "Pago: Transferencia",
    "Nota: Timbre B",
    "",
    "(Lo que va por kg se ajusta al pesarlo.)",
  ].join("\n"));
  assert.match(urlWhatsapp("5493434567890", m), /^https:\/\/wa\.me\/5493434567890\?text=Hola%20Despensa/);
});

test("configTiendaValida limpia y exige una forma de entrega", () => {
  const c = configTiendaValida({ activa: true, whatsapp: "<b>343</b> 456", mensaje: "  Hola  ", retiro: false, envio: false, x: 1 });
  assert.deepEqual(c, { activa: true, whatsapp: "343 456", mensaje: "Hola", mostrarSinStock: false, retiro: true, envio: false });
  assert.equal(configTiendaValida(null).activa, false);
});
