// lib/afip/explicar-error.test.ts — correr con: npm test
// Los mensajes son los que devuelve lib/afip/mensajes.ts (y ARCA crudo).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { explicarErrorAfip } from "./explicar-error.ts";

describe("explicarErrorAfip", () => {
  test("certificado sin autorizar para wsfe -> paso Autorizar", () => {
    const e = explicarErrorAfip("El certificado no está autorizado para Facturación electrónica (wsfe). Asocialo en el Administrador de Relaciones de AFIP.");
    assert.equal(e.paso, "autorizar");
  });

  test("certificado de otro ambiente (respuesta real de homologacion: 'Certificado bloqueado') -> paso Certificado", () => {
    assert.equal(explicarErrorAfip("AFIP rechazó el certificado: Certificado bloqueado").paso, "certificado");
  });

  test("certificado vencido -> generar pedido nuevo", () => {
    assert.equal(explicarErrorAfip("AFIP rechazó el certificado: cms.cert.expired").paso, "pedido");
  });

  test("punto de venta no habilitado (11002) -> paso Punto de venta", () => {
    assert.equal(explicarErrorAfip("AFIP: 11002: El punto de venta no se encuentra habilitado").paso, "punto-venta");
  });

  test("CUIT distinta (601) -> datos fiscales", () => {
    assert.equal(explicarErrorAfip("AFIP: 601: CUIT representada no incluida en Token").paso, "datos");
  });

  test("ARCA caido -> esperar, sin paso", () => {
    const e = explicarErrorAfip("No se pudo conectar con AFIP (timeout). Probá en unos minutos.");
    assert.equal(e.paso, null);
    assert.match(e.titulo, /no está respondiendo/);
  });

  test("error desconocido: se muestra tal cual", () => {
    const e = explicarErrorAfip("10999: algo nuevo de ARCA");
    assert.equal(e.queHacer, "10999: algo nuevo de ARCA");
    assert.equal(e.paso, null);
  });
});
