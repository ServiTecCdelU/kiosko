// tests/db/venta.test.ts — process_sale_kiosko contra una base real.
// Correr con: npm run test:db
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hayBaseDePrueba,
  motivoSkip,
  crearEscenario,
  vender,
  stockDe,
  saldoDe,
  db,
} from "./harness.ts";

describe("process_sale_kiosko", { skip: hayBaseDePrueba ? false : motivoSkip }, () => {
  test("una venta en efectivo descuenta el stock y registra la venta", async () => {
    const e = await crearEscenario("venta_ok", { stock: 10, precio: 100 });
    try {
      const { data, error } = await vender(e, { cantidad: 3, precio: 100 });
      assert.equal(error, null);
      assert.equal(Number(data.total), 300);
      assert.ok(data.sale_number, "tiene que devolver numero de ticket");

      assert.equal(await stockDe(e.productoId), 7);

      const { data: mov } = await db()
        .from("stock_movimientos")
        .select("tipo,cantidad")
        .eq("comercio_id", e.comercioId);
      assert.equal(mov?.length, 1);
      assert.equal(mov?.[0].tipo, "venta");
      assert.equal(Number(mov?.[0].cantidad), -3);
    } finally {
      await e.limpiar();
    }
  });

  test("NO deja vender mas de lo que hay en stock", async () => {
    const e = await crearEscenario("sin_stock", { stock: 2 });
    try {
      const { error } = await vender(e, { cantidad: 5 });
      assert.ok(error, "tiene que fallar");
      assert.match(error!.message, /[Ss]tock insuficiente/);
      // y no puede haber tocado el stock
      assert.equal(await stockDe(e.productoId), 2);
    } finally {
      await e.limpiar();
    }
  });

  test("un producto sin stock controlado (servicio) se vende sin descontar", async () => {
    const e = await crearEscenario("servicio", { stock: 0, stockControlado: false });
    try {
      const { error } = await vender(e, { cantidad: 3 });
      assert.equal(error, null);
      assert.equal(await stockDe(e.productoId), 0);
    } finally {
      await e.limpiar();
    }
  });

  test("rechaza una cantidad de cero o negativa", async () => {
    const e = await crearEscenario("cant_invalida");
    try {
      const { error } = await vender(e, { cantidad: 0 });
      assert.ok(error);
      assert.match(error!.message, /[Cc]antidad invalida/);
    } finally {
      await e.limpiar();
    }
  });

  test("NO deja vender con la caja cerrada", async () => {
    const e = await crearEscenario("caja_cerrada", { cajaAbierta: false });
    try {
      const { error } = await vender(e, { cantidad: 1 });
      assert.ok(error);
      assert.match(error!.message, /caja/i);
      assert.equal(await stockDe(e.productoId), 10);
    } finally {
      await e.limpiar();
    }
  });

  test("permite vender sin caja (venta suelta)", async () => {
    const e = await crearEscenario("sin_caja");
    try {
      const { error } = await vender(e, { cantidad: 1, cajaId: null });
      assert.equal(error, null);
    } finally {
      await e.limpiar();
    }
  });
});

describe("process_sale_kiosko — fiado", { skip: hayBaseDePrueba ? false : motivoSkip }, () => {
  test("una venta fiada carga la deuda a la cuenta del cliente", async () => {
    const e = await crearEscenario("fiado_ok", { precio: 250 });
    try {
      const { error } = await vender(e, {
        cantidad: 2,
        precio: 250,
        metodo: "fiado",
        clienteId: e.clienteId,
      });
      assert.equal(error, null);
      assert.equal(await saldoDe(e.clienteId), 500);

      const { data: movs } = await db()
        .from("cuenta_corriente_mov")
        .select("tipo,monto,saldo_anterior,saldo_nuevo")
        .eq("cliente_id", e.clienteId);
      assert.equal(movs?.length, 1);
      assert.equal(movs?.[0].tipo, "cargo");
      assert.equal(Number(movs?.[0].monto), 500);
      assert.equal(Number(movs?.[0].saldo_anterior), 0);
      assert.equal(Number(movs?.[0].saldo_nuevo), 500);
    } finally {
      await e.limpiar();
    }
  });

  test("una venta fiada SIN cliente se rechaza", async () => {
    const e = await crearEscenario("fiado_sin_cliente");
    try {
      const { error } = await vender(e, { metodo: "fiado", clienteId: null });
      assert.ok(error);
      assert.match(error!.message, /requiere un cliente/i);
    } finally {
      await e.limpiar();
    }
  });

  test("respeta el limite de credito y no deja pasarse", async () => {
    const e = await crearEscenario("fiado_limite", {
      precio: 100,
      limiteCredito: 1000,
      saldoCliente: 900,
    });
    try {
      // 900 + 200 = 1100 > 1000
      const { error } = await vender(e, {
        cantidad: 2,
        precio: 100,
        metodo: "fiado",
        clienteId: e.clienteId,
      });
      assert.ok(error, "tiene que frenar la venta");
      assert.match(error!.message, /[Ll]imite de credito/);

      // ni la deuda ni el stock se tocaron
      assert.equal(await saldoDe(e.clienteId), 900);
      assert.equal(await stockDe(e.productoId), 10);
    } finally {
      await e.limpiar();
    }
  });

  test("justo en el limite la venta pasa", async () => {
    const e = await crearEscenario("fiado_justo", {
      precio: 100,
      limiteCredito: 1000,
      saldoCliente: 900,
    });
    try {
      const { error } = await vender(e, {
        cantidad: 1,
        precio: 100,
        metodo: "fiado",
        clienteId: e.clienteId,
      });
      assert.equal(error, null);
      assert.equal(await saldoDe(e.clienteId), 1000);
    } finally {
      await e.limpiar();
    }
  });

  test("limite en cero significa sin limite", async () => {
    const e = await crearEscenario("fiado_sin_limite", {
      precio: 100000,
      limiteCredito: 0,
      saldoCliente: 500000,
    });
    try {
      const { error } = await vender(e, {
        cantidad: 1,
        precio: 100000,
        metodo: "fiado",
        clienteId: e.clienteId,
      });
      assert.equal(error, null);
      assert.equal(await saldoDe(e.clienteId), 600000);
    } finally {
      await e.limpiar();
    }
  });

  test("no deja fiar a un cliente de otro comercio", async () => {
    const a = await crearEscenario("fiado_comercio_a");
    const b = await crearEscenario("fiado_comercio_b");
    try {
      const { error } = await vender(a, { metodo: "fiado", clienteId: b.clienteId });
      assert.ok(error, "no puede aceptar un cliente de otro comercio");
    } finally {
      await a.limpiar();
      await b.limpiar();
    }
  });
});
