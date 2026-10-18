// lib/tienda.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  armarItemsPedido, configTiendaValida, datosClienteValidos, mensajeEstadoPedido, mensajePedido, numeroWhatsapp,
  puedePasarA, totalPedido, urlWhatsapp,
} from "./tienda.ts";
import { precioLinea } from "./pricing.ts";

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

describe("pedidos (etapa 2)", () => {
  const productos = [
    { id: "t", name: "Tomate", unidad: "kg", price: 2500, hayStock: true, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 20 },
    { id: "b", name: "Banana", unidad: "kg", price: 1800, hayStock: true, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 3000, ofertaCantidad: 2 },
    { id: "h", name: "Huevos", unidad: "un", price: 7500, hayStock: true },
    { id: "x", name: "Palta", unidad: "kg", price: 5000, hayStock: false },
  ];

  test("precios del servidor, con oferta y combo", () => {
    const r = armarItemsPedido(
      [{ productId: "t", cantidad: 0.75 }, { productId: "b", cantidad: 2.5 }, { productId: "h", cantidad: 2 }],
      productos, precioLinea,
    );
    assert.ok("items" in r);
    assert.deepEqual(r.items.map((i) => i.subtotal), [1500, 3900, 15000]);
    assert.equal(r.total, 20400);
  });

  test("rechaza lo que no se puede pedir", () => {
    const err = (l: { productId: string; cantidad: number }[]) => "error" in armarItemsPedido(l, productos, precioLinea);
    assert.ok(err([]));
    assert.ok(err([{ productId: "no", cantidad: 1 }]));
    assert.ok(err([{ productId: "x", cantidad: 1 }]), "sin stock");
    assert.ok(err([{ productId: "h", cantidad: 1.5 }]), "unidades fraccionadas");
    assert.ok(err([{ productId: "h", cantidad: 0 }]));
    assert.ok(err([{ productId: "t", cantidad: 51 }]), "mas de 50 kg");
    assert.ok(err([{ productId: "h", cantidad: 1 }, { productId: "h", cantidad: 1 }]), "repetido");
  });

  test("datos del cliente", () => {
    const tienda = { retiro: true, envio: false };
    const ok = datosClienteValidos({ nombre: " Juan  Pérez ", telefono: "343 15 456 7890", entrega: "retiro", pago: "efectivo", direccion: "x" }, tienda);
    assert.deepEqual(ok, { nombre: "Juan Pérez", telefono: "5493434567890", entrega: "retiro", direccion: null, pago: "efectivo", nota: null });
    assert.ok("error" in datosClienteValidos({ nombre: "Juan", telefono: "123", entrega: "retiro", pago: "efectivo" }, tienda));
    assert.ok("error" in datosClienteValidos({ nombre: "Juan", telefono: "3434567890", entrega: "envio", pago: "efectivo", direccion: "Calle 1" }, tienda), "envio no ofrecido");
    assert.ok("error" in datosClienteValidos({ nombre: "Juan", telefono: "3434567890", entrega: "envio", pago: "efectivo" }, { retiro: true, envio: true }), "sin direccion");
  });

  test("estados y avisos", () => {
    assert.equal(puedePasarA("nuevo", "preparando"), true);
    assert.equal(puedePasarA("entregado", "cancelado"), false);
    assert.equal(puedePasarA("listo", "preparando"), false);
    assert.equal(mensajeEstadoPedido("listo", 7, "Don Tito", "retiro", "Juan Pérez"), "Hola Juan! Te escribimos de Don Tito. Tu pedido N° 7 está listo para retirar.");
  });
});
