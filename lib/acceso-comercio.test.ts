// lib/acceso-comercio.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluarAcceso, esLectura, DIAS_AVISO, DIAS_GRACIA } from "./acceso-comercio.ts";

const DIA = 86_400_000;
const ahora = new Date("2026-10-15T15:00:00Z");
const en = (dias: number) => new Date(ahora.getTime() + dias * DIA).toISOString();

describe("evaluarAcceso", () => {
  test("comercio activo: acceso completo sin aviso", () => {
    const r = evaluarAcceso({ estado: "activo", trial_hasta: en(-100) }, ahora);
    assert.equal(r.nivel, "completo");
    assert.equal(r.motivo, "ok");
  });

  test("prueba sin fecha de fin: acceso completo", () => {
    assert.equal(evaluarAcceso({ estado: "prueba", trial_hasta: null }, ahora).motivo, "ok");
  });

  test("prueba lejos del vencimiento: sin aviso", () => {
    const r = evaluarAcceso({ estado: "prueba", trial_hasta: en(DIAS_AVISO + 1) }, ahora);
    assert.equal(r.nivel, "completo");
    assert.equal(r.motivo, "ok");
  });

  test(`los ultimos ${DIAS_AVISO} dias avisa cuantos quedan`, () => {
    const r = evaluarAcceso({ estado: "prueba", trial_hasta: en(2.5) }, ahora);
    assert.equal(r.nivel, "completo");
    assert.equal(r.motivo, "prueba_por_vencer");
    assert.equal(r.dias, 3);
  });

  test("vencida pero dentro de la gracia: sigue andando y cuenta los dias de gracia", () => {
    const r = evaluarAcceso({ estado: "prueba", trial_hasta: en(-1) }, ahora);
    assert.equal(r.nivel, "completo");
    assert.equal(r.motivo, "prueba_en_gracia");
    assert.equal(r.dias, DIAS_GRACIA - 1);
  });

  test("pasada la gracia queda en solo lectura", () => {
    const r = evaluarAcceso({ estado: "prueba", trial_hasta: en(-DIAS_GRACIA - 0.01) }, ahora);
    assert.equal(r.nivel, "solo_lectura");
    assert.equal(r.motivo, "prueba_vencida");
  });

  test("justo en el limite de la gracia ya bloquea", () => {
    const r = evaluarAcceso({ estado: "prueba", trial_hasta: en(-DIAS_GRACIA) }, ahora);
    assert.equal(r.nivel, "solo_lectura");
  });

  test("suspendido y baja bloquean al instante, sin gracia", () => {
    assert.equal(evaluarAcceso({ estado: "suspendido", trial_hasta: null }, ahora).nivel, "solo_lectura");
    assert.equal(evaluarAcceso({ estado: "baja", trial_hasta: en(30) }, ahora).motivo, "baja");
  });

  test("devuelve la fecha de vencimiento de la prueba", () => {
    const fin = en(-10);
    assert.equal(evaluarAcceso({ estado: "prueba", trial_hasta: fin }, ahora).venceEl, fin);
  });
});

describe("esLectura", () => {
  test("las consultas son lecturas aunque vayan por POST", () => {
    assert.equal(esLectura("/api/consultas/ventas", "POST"), true);
  });

  test("cualquier GET es lectura", () => {
    assert.equal(esLectura("/api/mercadopago/dispositivos", "GET"), true);
  });

  test("reimprimir un ticket no modifica datos", () => {
    assert.equal(esLectura("/api/imprimir-ticket", "POST"), true);
  });

  test("vender, editar y borrar son escrituras", () => {
    assert.equal(esLectura("/api/ventas", "POST"), false);
    assert.equal(esLectura("/api/productos", "PATCH"), false);
    assert.equal(esLectura("/api/mercadopago/conexion", "DELETE"), false);
  });
});
