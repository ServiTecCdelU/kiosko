// lib/pwa/sw.test.ts — correr con: npm test
// Carga public/sw.js en un entorno simulado de service worker (produccion bajo
// /comercio) y verifica que decide bien que cachear y que responder sin red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const CODIGO = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGEN = "https://www.servitec.net.ar";

interface Escenario {
  hayRed: boolean;
  cache: Map<string, Response>;
  pedidosRed: string[];
  oyentes: Record<string, (e: any) => void>;
}

function cargarSW(opciones: { hayRed: boolean; host?: string; base?: string } = { hayRed: true }): Escenario {
  const base = opciones.base ?? "/comercio";
  const host = opciones.host ?? "www.servitec.net.ar";
  const esc: Escenario = { hayRed: opciones.hayRed, cache: new Map(), pedidosRed: [], oyentes: {} };
  const clave = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGEN).href : r.url);
  const cacheApi = {
    open: async () => ({ put: async (r: Request, res: Response) => void esc.cache.set(clave(r), res) }),
    match: async (r: Request | string) => esc.cache.get(clave(r))?.clone(),
    keys: async () => [],
    delete: async () => true,
  };
  const self = {
    registration: { scope: `https://${host}${base}/` },
    location: { hostname: host, origin: `https://${host}` },
    clients: { claim: () => {} },
    skipWaiting: () => {},
    addEventListener: (tipo: string, fn: (e: any) => void) => void (esc.oyentes[tipo] = fn),
  };
  const fetchFalso = async (r: Request) => {
    esc.pedidosRed.push(r.url);
    if (!esc.hayRed) throw new TypeError("Failed to fetch");
    return new Response(`red:${new URL(r.url).pathname}`, { status: 200 });
  };
  runInNewContext(CODIGO, { self, caches: cacheApi, fetch: fetchFalso, URL, Response, Request, Promise, console });
  return esc;
}

/** Simula un fetch del navegador; devuelve la respuesta del SW o null si no intercepto. */
async function pedir(esc: Escenario, ruta: string, opciones: { modo?: string; headers?: Record<string, string>; metodo?: string } = {}) {
  const request = new Request(`${ORIGEN}${ruta}`, { method: opciones.metodo ?? "GET", headers: opciones.headers });
  if (opciones.modo) Object.defineProperty(request, "mode", { value: opciones.modo });
  const respuesta: { p: Promise<Response> | null } = { p: null };
  esc.oyentes.fetch({ request, respondWith: (p: Promise<Response>) => (respuesta.p = p) });
  return respuesta.p ? await respuesta.p : null;
}

describe("service worker (produccion bajo /comercio)", () => {
  test("la API nunca pasa por el cache (antes solo excluia /api/ y en produccion es /comercio/api/)", async () => {
    const esc = cargarSW();
    assert.equal(await pedir(esc, "/comercio/api/acceso"), null);
    assert.equal(await pedir(esc, "/comercio/api/backup"), null);
  });

  test("no toca POST (ventas) ni otros origenes", async () => {
    const esc = cargarSW();
    assert.equal(await pedir(esc, "/comercio/api/ventas", { metodo: "POST" }), null);
  });

  test("pantalla con red: la sirve de la red y la guarda", async () => {
    const esc = cargarSW();
    const r = await pedir(esc, "/comercio/stock", { modo: "navigate" });
    assert.equal(await r!.text(), "red:/comercio/stock");
    await new Promise((ok) => setTimeout(ok, 0));
    assert.ok(esc.cache.has(`${ORIGEN}/comercio/stock`));
  });

  test("pantalla sin red: la ultima copia guardada", async () => {
    const esc = cargarSW();
    await pedir(esc, "/comercio/stock", { modo: "navigate" });
    await new Promise((ok) => setTimeout(ok, 0));
    esc.hayRed = false;
    const r = await pedir(esc, "/comercio/stock", { modo: "navigate" });
    assert.equal(await r!.text(), "red:/comercio/stock");
  });

  test("pantalla nunca visitada sin red: cae al punto de venta DEL BASEPATH (/comercio/pos)", async () => {
    const esc = cargarSW();
    await pedir(esc, "/comercio/pos", { modo: "navigate" });
    await new Promise((ok) => setTimeout(ok, 0));
    esc.hayRed = false;
    const r = await pedir(esc, "/comercio/reportes", { modo: "navigate" });
    assert.equal(await r!.text(), "red:/comercio/pos");
  });

  test("sin red y sin nada guardado: responde 503, nunca undefined (eso rompia la pagina)", async () => {
    const esc = cargarSW({ hayRed: false });
    const r = await pedir(esc, "/comercio/caja", { modo: "navigate" });
    assert.equal(r!.status, 503);
  });

  test("navegacion interna de Next (RSC): red primero, no un deploy viejo del cache", async () => {
    const esc = cargarSW();
    esc.cache.set(`${ORIGEN}/comercio/stock?_rsc=abc`, new Response("viejo"));
    const r = await pedir(esc, "/comercio/stock?_rsc=abc", { headers: { RSC: "1" } });
    assert.equal(await r!.text(), "red:/comercio/stock");
  });

  test("assets estaticos: cache primero", async () => {
    const esc = cargarSW();
    esc.cache.set(`${ORIGEN}/comercio/_next/static/app.js`, new Response("del-cache"));
    const r = await pedir(esc, "/comercio/_next/static/app.js");
    assert.equal(await r!.text(), "del-cache");
  });

  test("en localhost no intercepta nada (en desarrollo mostraba codigo viejo)", async () => {
    const esc = cargarSW({ hayRed: true, host: "localhost", base: "" });
    assert.equal(await pedir(esc, "/pos", { modo: "navigate" }), null);
  });
});
