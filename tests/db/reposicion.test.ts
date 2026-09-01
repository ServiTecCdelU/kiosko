// tests/db/reposicion.test.ts — productos_reposicion_predictiva contra una base real.
// Correr con: npm run test:db
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hayBaseDePrueba, motivoSkip, crearEscenario, vender, db } from "./harness.ts";

async function anular(ventaId: string, comercioId: string) {
  return db().rpc("anular_venta_kiosko", {
    p_venta_id: ventaId,
    p_comercio_id: comercioId,
    p_usuario_id: null,
    p_usuario_nombre: "Test",
    p_motivo: "test",
  });
}

interface FilaReposicion {
  producto_id: string;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
  unidades_vendidas: number;
  velocidad_diaria: number;
  dias_restantes: number | null;
}

describe("productos_reposicion_predictiva", { skip: hayBaseDePrueba ? false : motivoSkip }, () => {
  test("calcula unidades vendidas y dias restantes segun el ritmo de venta", async () => {
    const e = await crearEscenario("reposicion_ok", { stock: 20, precio: 100 });
    try {
      await vender(e, { cantidad: 3, precio: 100 });
      await vender(e, { cantidad: 4, precio: 100 });

      const { data, error } = await db().rpc("productos_reposicion_predictiva", {
        p_comercio_id: e.comercioId,
        p_dias: 7,
      });
      assert.equal(error, null);

      const fila = (data as FilaReposicion[]).find((r) => r.producto_id === e.productoId);
      assert.ok(fila, "el producto vendido tiene que aparecer en el resultado");
      assert.equal(Number(fila!.unidades_vendidas), 7);
      assert.equal(Number(fila!.stock_actual), 13);
      // velocidad = 7 unidades / 7 dias = 1/dia -> stock 13 / 1 = 13 dias restantes
      assert.equal(Number(fila!.velocidad_diaria), 1);
      assert.equal(Number(fila!.dias_restantes), 13);
    } finally {
      await e.limpiar();
    }
  });

  test("no incluye productos sin ventas en el periodo", async () => {
    const e = await crearEscenario("reposicion_sin_ventas", { stock: 20, precio: 100 });
    try {
      const { data, error } = await db().rpc("productos_reposicion_predictiva", {
        p_comercio_id: e.comercioId,
        p_dias: 14,
      });
      assert.equal(error, null);

      const fila = (data as FilaReposicion[]).find((r) => r.producto_id === e.productoId);
      assert.equal(fila, undefined, "sin ventas recientes, no debe sugerir reposicion");
    } finally {
      await e.limpiar();
    }
  });

  test("una venta anulada no cuenta para el calculo", async () => {
    const e = await crearEscenario("reposicion_anulada", { stock: 20, precio: 100 });
    try {
      const { data: venta } = await vender(e, { cantidad: 5, precio: 100 });
      await anular(venta.id, e.comercioId);

      const { data, error } = await db().rpc("productos_reposicion_predictiva", {
        p_comercio_id: e.comercioId,
        p_dias: 14,
      });
      assert.equal(error, null);

      const fila = (data as FilaReposicion[]).find((r) => r.producto_id === e.productoId);
      assert.equal(fila, undefined, "una venta anulada no debe contarse como unidad vendida");
    } finally {
      await e.limpiar();
    }
  });

  test("no mezcla ventas de otro comercio", async () => {
    const propio = await crearEscenario("reposicion_propio", { stock: 20, precio: 100 });
    const ajeno = await crearEscenario("reposicion_ajeno", { stock: 20, precio: 100 });
    try {
      await vender(ajeno, { cantidad: 9, precio: 100 });

      const { data, error } = await db().rpc("productos_reposicion_predictiva", {
        p_comercio_id: propio.comercioId,
        p_dias: 14,
      });
      assert.equal(error, null);

      const filaPropia = (data as FilaReposicion[]).find((r) => r.producto_id === propio.productoId);
      const filaAjena = (data as FilaReposicion[]).find((r) => r.producto_id === ajeno.productoId);
      assert.equal(filaPropia, undefined);
      assert.equal(filaAjena, undefined, "la RPC no debe devolver productos de otro comercio");
    } finally {
      await propio.limpiar();
      await ajeno.limpiar();
    }
  });
});
