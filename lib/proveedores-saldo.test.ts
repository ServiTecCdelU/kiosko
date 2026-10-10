// lib/proveedores-saldo.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  repartirPago, resumenSaldos, saldoCompra, deudaTotal, errorPago, comprasPendientes, type CompraConSaldo,
} from "./proveedores-saldo.ts";

const compras: CompraConSaldo[] = [
  { id: "c3", proveedorId: "p1", total: 5000, pagado: 0, createdAt: "2026-10-03T10:00:00Z" },
  { id: "c1", proveedorId: "p1", total: 10000, pagado: 4000, createdAt: "2026-10-01T10:00:00Z", vence: "2026-10-15" },
  { id: "c2", proveedorId: "p1", total: 2000, pagado: 2000, createdAt: "2026-10-02T10:00:00Z" },
  { id: "c4", proveedorId: "p2", total: 800, pagado: 0, createdAt: "2026-10-04T10:00:00Z", vence: "2026-10-12" },
];

describe("saldos", () => {
  test("saldo de una compra nunca es negativo", () => {
    assert.equal(saldoCompra({ total: 100, pagado: 40 }), 60);
    assert.equal(saldoCompra({ total: 100, pagado: 130 }), 0);
  });
  test("pendientes: solo con saldo, de la mas vieja a la mas nueva", () => {
    assert.deepEqual(comprasPendientes(compras).map((c) => c.id), ["c1", "c3", "c4"]);
  });
  test("deuda total suma los saldos", () => {
    assert.equal(deudaTotal(compras), 6000 + 5000 + 800);
  });
});

describe("repartirPago", () => {
  test("FIFO: completa la mas vieja y sigue con la siguiente", () => {
    const prov = compras.filter((c) => c.proveedorId === "p1");
    assert.deepEqual(repartirPago(7500, prov), [
      { compraId: "c1", monto: 6000 },
      { compraId: "c3", monto: 1500 },
    ]);
  });
  test("un pago chico queda todo en la primera", () => {
    const prov = compras.filter((c) => c.proveedorId === "p1");
    assert.deepEqual(repartirPago(1000, prov), [{ compraId: "c1", monto: 1000 }]);
  });
  test("no reparte mas que la deuda", () => {
    const prov = compras.filter((c) => c.proveedorId === "p1");
    const ap = repartirPago(99999, prov);
    assert.equal(ap.reduce((s, a) => s + a.monto, 0), 11000);
  });
  test("monto cero o invalido no aplica nada", () => {
    assert.deepEqual(repartirPago(0, compras), []);
    assert.deepEqual(repartirPago(Number.NaN, compras), []);
  });
});

describe("resumenSaldos", () => {
  test("agrupa por proveedor, ordena por deuda y trae desde y proximo vencimiento", () => {
    const r = resumenSaldos(compras);
    assert.equal(r.length, 2);
    assert.equal(r[0].proveedorId, "p1");
    assert.equal(r[0].saldo, 11000);
    assert.equal(r[0].compras, 2);
    assert.equal(r[0].desde, "2026-10-01T10:00:00.000Z");
    assert.equal(r[0].proximoVencimiento, "2026-10-15");
    assert.equal(r[1].saldo, 800);
  });
  test("sin deuda, sin filas", () => {
    assert.deepEqual(resumenSaldos([compras[2]]), []);
  });
});

describe("errorPago", () => {
  const prov = compras.filter((c) => c.proveedorId === "p1");
  test("valida monto, deuda total y saldo de la compra puntual", () => {
    assert.match(errorPago(0, prov)!, /mayor a cero/);
    assert.equal(errorPago(11000, prov), null);
    assert.match(errorPago(11000.5, prov)!, /supera lo que se le debe/);
    assert.equal(errorPago(6000, prov, "c1"), null);
    assert.match(errorPago(6001, prov, "c1")!, /supera el saldo/);
    assert.match(errorPago(10, prov, "zzz")!, /no existe/);
  });
});
