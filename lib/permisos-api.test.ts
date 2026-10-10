// lib/permisos-api.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { reglaDeRuta, autorizar } from "./permisos-api.ts";

describe("reglaDeRuta", () => {
  test("login, logout y sesion son publicos (son los que crean la sesion)", () => {
    assert.equal(reglaDeRuta("/api/auth/login", "POST"), "publica");
    assert.equal(reglaDeRuta("/api/auth/demo", "POST"), "publica");
    assert.equal(reglaDeRuta("/api/auth/session", "GET"), "publica");
  });

  test("el alta de un comercio nuevo es publica (todavia no hay sesion; la protege la cookie de registro)", () => {
    assert.equal(reglaDeRuta("/api/registro", "POST"), "publica");
  });

  test("el webhook de Mercado Pago es publico (MP no manda cookie)", () => {
    assert.equal(reglaDeRuta("/api/mercadopago/webhook", "POST"), "publica");
  });

  test("el webhook de la suscripcion es publico (Mercado Pago no tiene sesion)", () => {
    assert.equal(reglaDeRuta("/api/billing/webhook", "POST"), "publica");
  });

  test("superadmin se valida en sus propias rutas", () => {
    assert.equal(reglaDeRuta("/api/superadmin/comercios", "POST"), "superadmin");
  });

  test("lo del mostrador pide sesion de cualquier rol", () => {
    for (const ruta of ["/api/ventas", "/api/caja", "/api/consultas/productos", "/api/productos", "/api/imprimir-ticket"]) {
      assert.equal(reglaDeRuta(ruta, "POST"), "sesion", ruta);
    }
  });

  test("empleados, compras, importacion, sincronizacion y reportes son solo admin", () => {
    for (const ruta of [
      "/api/usuarios", "/api/consultas/usuarios", "/api/compras", "/api/compras/anular",
      "/api/proveedores", "/api/proveedores/pagos", "/api/consultas/compras", "/api/productos/importar", "/api/sync",
      "/api/consultas/reportes", "/api/mercadopago/conexion", "/api/backup",
      "/api/inventario", "/api/consultas/inventario", "/api/lotes", "/api/billing", "/api/billing/pagar",
    ]) {
      assert.equal(reglaDeRuta(ruta, "POST"), "admin", ruta);
    }
  });

  test("configurar AFIP es del admin; facturar y reintentar, de cualquier rol con sesion", () => {
    for (const ruta of ["/api/afip/config", "/api/afip/pedido", "/api/afip/certificado", "/api/afip/probar"]) {
      assert.equal(reglaDeRuta(ruta, "POST"), "admin", ruta);
    }
    assert.equal(reglaDeRuta("/api/afip/facturar", "POST"), "sesion");
    assert.equal(reglaDeRuta("/api/afip/reintentar", "POST"), "sesion");
  });

  test("'que PC es esta' es publico (pantalla de login); registrar y quitar PCs es del admin", () => {
    assert.equal(reglaDeRuta("/api/dispositivo", "GET"), "publica");
    assert.equal(reglaDeRuta("/api/dispositivos", "POST"), "admin");
    assert.equal(reglaDeRuta("/api/dispositivos", "DELETE"), "admin");
  });

  test("listar lectores Point es del mostrador; cambiarles el modo es del admin", () => {
    assert.equal(reglaDeRuta("/api/mercadopago/dispositivos", "GET"), "sesion");
    assert.equal(reglaDeRuta("/api/mercadopago/dispositivos", "PATCH"), "admin");
  });

  test("un prefijo no matchea rutas que solo empiezan igual", () => {
    assert.equal(reglaDeRuta("/api/usuarios-raros", "GET"), "sesion");
  });

  test("ruta desconocida: pide sesion (falla cerrado)", () => {
    assert.equal(reglaDeRuta("/api/algo-nuevo", "GET"), "sesion");
  });
});

describe("autorizar", () => {
  const cajero = { comercioId: "c1", rol: "cajero" };
  const admin = { comercioId: "c1", rol: "admin" };
  const superadminPuro = { comercioId: "__superadmin__", rol: "superadmin", superadmin: true };

  test("publica pasa sin sesion", () => {
    assert.equal(autorizar("publica", null), null);
  });

  test("sin sesion, una ruta de comercio responde 401", () => {
    assert.equal(autorizar("sesion", null), 401);
    assert.equal(autorizar("admin", null), 401);
  });

  test("el superadmin fuera de un comercio no opera rutas de comercio", () => {
    assert.equal(autorizar("sesion", superadminPuro), 401);
  });

  test("cajero entra al mostrador pero no a lo de admin", () => {
    assert.equal(autorizar("sesion", cajero), null);
    assert.equal(autorizar("admin", cajero), 403);
  });

  test("admin entra a todo lo del comercio", () => {
    assert.equal(autorizar("admin", admin), null);
  });

  test("las rutas de superadmin se autorizan adentro (pasan siempre)", () => {
    assert.equal(autorizar("superadmin", null), null);
  });
});
