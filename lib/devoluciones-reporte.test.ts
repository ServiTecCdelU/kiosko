// lib/devoluciones-reporte.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ajusteDevoluciones, esMovimientoDeDevolucion } from "./devoluciones-reporte.ts";

describe("ajusteDevoluciones", () => {
  test("efectivo y fiado restan; un cambio sin reembolso no", () => {
    const r = ajusteDevoluciones([
      { total: 2200, reembolso: "efectivo", metodoVenta: "efectivo", items: [{ productoId: "masas", cantidad: 0.1, subtotal: 2200 }] },
      { total: 7215, reembolso: "ninguno", metodoVenta: "fiado", items: [{ productoId: "pollo", cantidad: 1.85, subtotal: 7215 }] },
      { total: 500, reembolso: "ninguno", metodoVenta: "transferencia", items: [{ productoId: "yerba", cantidad: 1, subtotal: 500 }] },
    ]);
    assert.equal(r.efectivo, 2200);
    assert.equal(r.fiado, 7215);
    assert.equal(r.total, 9415);
    assert.deepEqual(r.porProducto.get("masas"), { cantidad: 0.1, total: 2200 });
    assert.equal(r.porProducto.has("yerba"), false);
  });
});

test("reconoce el movimiento de caja de una devolucion", () => {
  assert.equal(esMovimientoDeDevolucion("Devolucion venta 0042"), true);
  assert.equal(esMovimientoDeDevolucion("Pago de luz"), false);
  assert.equal(esMovimientoDeDevolucion(null), false);
});
