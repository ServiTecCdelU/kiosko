// tests/db/lotes.test.ts — los lotes de vencimiento se descuentan al vender
// (trigger lotes_por_movimiento, 50_*.sql) y vuelven con la anulacion.
// Correr con: npm run test:db
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hayBaseDePrueba, motivoSkip, crearEscenario, vender, db, type Escenario } from "./harness.ts";

async function crearLote(e: Escenario, id: string, fecha: string, cantidad: number) {
  const { error } = await db().from("producto_lotes").insert({
    id, comercio_id: e.comercioId, producto_id: e.productoId, fecha_vencimiento: fecha, cantidad,
  });
  assert.equal(error, null);
  await db().rpc("sincronizar_vencimiento_producto", { p_comercio_id: e.comercioId, p_producto_id: e.productoId });
}

async function lotes(e: Escenario) {
  const { data } = await db()
    .from("producto_lotes").select("id, cantidad, activo, agotado_at")
    .eq("producto_id", e.productoId).order("fecha_vencimiento", { ascending: true });
  return data ?? [];
}

async function vencimientoDe(e: Escenario): Promise<string | null> {
  const { data } = await db().from("productos").select("fecha_vencimiento").eq("id", e.productoId).single();
  return data?.fecha_vencimiento ?? null;
}

describe("lotes al vender", { skip: hayBaseDePrueba ? false : motivoSkip }, () => {
  test("una venta consume primero el lote que vence antes y, al agotarlo, la fecha pasa al siguiente", async () => {
    const e = await crearEscenario("lotes_fifo", { stock: 20 });
    try {
      await crearLote(e, `lote_${e.productoId}_a`, "2026-10-20", 4);
      await crearLote(e, `lote_${e.productoId}_b`, "2026-11-15", 10);
      assert.equal(await vencimientoDe(e), "2026-10-20");

      const { error } = await vender(e, { cantidad: 6 });
      assert.equal(error, null);

      const l = await lotes(e);
      assert.equal(l[0].cantidad, 0);
      assert.equal(l[0].activo, false, "el lote agotado se da de baja solo");
      assert.ok(l[0].agotado_at, "queda marcado como agotado por ventas");
      assert.equal(l[1].cantidad, 8);
      assert.equal(await vencimientoDe(e), "2026-11-15", "la fecha del producto pasa al lote siguiente");
    } finally {
      await e.limpiar();
    }
  });

  test("anular la venta devuelve la cantidad al lote (reactiva el agotado si no queda otro)", async () => {
    const e = await crearEscenario("lotes_anular", { stock: 5 });
    try {
      await crearLote(e, `lote_${e.productoId}_a`, "2026-10-20", 5);
      const { data: venta } = await vender(e, { cantidad: 5 });
      assert.equal((await lotes(e))[0].activo, false);
      assert.equal(await vencimientoDe(e), null, "sin lotes activos el producto queda sin fecha");

      const { error } = await db().rpc("anular_venta_kiosko", {
        p_venta_id: venta.id, p_comercio_id: e.comercioId, p_usuario_id: null, p_usuario_nombre: "Test", p_motivo: "test",
      });
      assert.equal(error, null);
      const l = await lotes(e);
      assert.equal(l[0].activo, true);
      assert.equal(l[0].cantidad, 5);
      assert.equal(await vencimientoDe(e), "2026-10-20");
    } finally {
      await e.limpiar();
    }
  });

  test("un producto sin lotes vende igual (el trigger no hace nada)", async () => {
    const e = await crearEscenario("lotes_sin", { stock: 3 });
    try {
      const { error } = await vender(e, { cantidad: 2 });
      assert.equal(error, null);
      assert.equal((await lotes(e)).length, 0);
    } finally {
      await e.limpiar();
    }
  });
});
