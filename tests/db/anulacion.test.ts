// tests/db/anulacion.test.ts — anular_venta_kiosko y registrar_pago_cuenta.
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

async function anular(ventaId: string, comercioId: string) {
  return db().rpc("anular_venta_kiosko", {
    p_venta_id: ventaId,
    p_comercio_id: comercioId,
    p_usuario_id: null,
    p_usuario_nombre: "Test",
    p_motivo: "test",
  });
}

describe("anular_venta_kiosko", { skip: hayBaseDePrueba ? false : motivoSkip }, () => {
  test("devuelve el stock y marca la venta como anulada (no la borra)", async () => {
    const e = await crearEscenario("anular_stock", { stock: 10 });
    try {
      const { data: venta } = await vender(e, { cantidad: 4 });
      assert.equal(await stockDe(e.productoId), 6);

      const { error } = await anular(venta.id, e.comercioId);
      assert.equal(error, null);
      assert.equal(await stockDe(e.productoId), 10);

      const { data: v } = await db()
        .from("ventas")
        .select("estado,motivo_anulacion")
        .eq("id", venta.id)
        .single();
      assert.equal(v?.estado, "anulada", "la venta se conserva para auditoria");
      assert.equal(v?.motivo_anulacion, "test");

      const { data: movs } = await db()
        .from("stock_movimientos")
        .select("tipo")
        .eq("comercio_id", e.comercioId);
      assert.ok(movs?.some((m) => m.tipo === "devolucion"));
    } finally {
      await e.limpiar();
    }
  });

  test("anular una venta fiada revierte la deuda del cliente", async () => {
    const e = await crearEscenario("anular_fiado", { precio: 300 });
    try {
      const { data: venta } = await vender(e, {
        cantidad: 1,
        precio: 300,
        metodo: "fiado",
        clienteId: e.clienteId,
      });
      assert.equal(await saldoDe(e.clienteId), 300);

      const { error } = await anular(venta.id, e.comercioId);
      assert.equal(error, null);
      assert.equal(await saldoDe(e.clienteId), 0, "la deuda tiene que volver a cero");

      // El movimiento de reversa se guarda con monto POSITIVO (correccion 6).
      const { data: movs } = await db()
        .from("cuenta_corriente_mov")
        .select("tipo,monto,saldo_anterior,saldo_nuevo")
        .eq("cliente_id", e.clienteId)
        .eq("tipo", "ajuste");
      assert.equal(movs?.length, 1);
      assert.ok(
        Number(movs?.[0].monto) > 0,
        "el monto tiene que ser positivo: el sentido lo da el saldo, no el signo",
      );
      assert.equal(Number(movs?.[0].saldo_anterior), 300);
      assert.equal(Number(movs?.[0].saldo_nuevo), 0);
    } finally {
      await e.limpiar();
    }
  });

  test("no se puede anular dos veces la misma venta", async () => {
    const e = await crearEscenario("anular_doble");
    try {
      const { data: venta } = await vender(e, { cantidad: 1 });
      await anular(venta.id, e.comercioId);

      const { error } = await anular(venta.id, e.comercioId);
      assert.ok(error, "la segunda anulacion tiene que fallar");
      assert.match(error!.message, /ya fue anulada/i);

      // y el stock no se devolvio dos veces
      assert.equal(await stockDe(e.productoId), 10);
    } finally {
      await e.limpiar();
    }
  });

  test("no se puede anular una venta de otro comercio", async () => {
    const a = await crearEscenario("anular_com_a");
    const b = await crearEscenario("anular_com_b");
    try {
      const { data: venta } = await vender(a, { cantidad: 1 });
      const { error } = await anular(venta.id, b.comercioId);
      assert.ok(error, "no puede anular una venta ajena");
      assert.equal(await stockDe(a.productoId), 9, "el stock del otro comercio no se toca");
    } finally {
      await a.limpiar();
      await b.limpiar();
    }
  });

  test("NO se puede anular si la caja de la venta ya fue cerrada", async () => {
    const e = await crearEscenario("anular_caja_cerrada");
    try {
      const { data: venta } = await vender(e, { cantidad: 2 });
      await db().from("caja").update({ estado: "cerrada" }).eq("id", e.cajaId);

      const { error } = await anular(venta.id, e.comercioId);
      assert.ok(error, "no puede alterar un arqueo ya cerrado");
      assert.match(error!.message, /caja/i);
      assert.equal(await stockDe(e.productoId), 8, "el stock no se devuelve");
    } finally {
      await db().from("caja").update({ estado: "abierta" }).eq("id", e.cajaId);
      await e.limpiar();
    }
  });
});

describe("registrar_pago_cuenta", { skip: hayBaseDePrueba ? false : motivoSkip }, () => {
  test("un abono reduce la deuda y deja el movimiento", async () => {
    const e = await crearEscenario("pago_ok", { saldoCliente: 1000 });
    try {
      const { data, error } = await db().rpc("registrar_pago_cuenta", {
        p_cliente_id: e.clienteId,
        p_monto: 400,
        p_usuario: "Test",
        p_referencia: null,
        p_comercio_id: e.comercioId,
      });
      assert.equal(error, null);
      assert.equal(Number(data.saldo_anterior), 1000);
      assert.equal(Number(data.saldo_nuevo), 600);
      assert.equal(await saldoDe(e.clienteId), 600);
    } finally {
      await e.limpiar();
    }
  });

  test("rechaza un pago de cero o negativo", async () => {
    const e = await crearEscenario("pago_cero", { saldoCliente: 1000 });
    try {
      for (const monto of [0, -50]) {
        const { error } = await db().rpc("registrar_pago_cuenta", {
          p_cliente_id: e.clienteId,
          p_monto: monto,
          p_usuario: null,
          p_referencia: null,
          p_comercio_id: e.comercioId,
        });
        assert.ok(error, `un pago de ${monto} tiene que fallar`);
      }
      assert.equal(await saldoDe(e.clienteId), 1000);
    } finally {
      await e.limpiar();
    }
  });
});
