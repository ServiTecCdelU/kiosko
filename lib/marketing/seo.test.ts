// lib/marketing/seo.test.ts — que paginas se indexan y que los datos
// estructurados de la landing esten bien formados.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { esPaginaIndexable, jsonLdLanding } from "./seo.ts";
import { FAQS } from "./faq.ts";

describe("esPaginaIndexable", () => {
  test("la landing, el registro y las paginas legales se indexan", () => {
    for (const r of ["/", "/registro", "/terms", "/privacy", "/sitemap.xml", "/registro/"]) {
      assert.equal(esPaginaIndexable(r), true, r);
    }
  });
  test("las pantallas privadas y el panel de cada comercio no", () => {
    for (const r of ["/pos", "/caja", "/login", "/demo", "/kiosko-el-sol", "/superadmin", "/api/consultas/caja"]) {
      assert.equal(esPaginaIndexable(r), false, r);
    }
  });
});

describe("jsonLdLanding", () => {
  const [org, app, faq] = jsonLdLanding("https://www.servitec.net.ar/comercio/", "https://www.servitec.net.ar/comercio/metadato.jpg");
  test("organizacion, aplicacion y preguntas frecuentes", () => {
    assert.equal(org["@type"], "Organization");
    assert.equal(app["@type"], "SoftwareApplication");
    assert.equal(faq["@type"], "FAQPage");
  });
  test("las preguntas publicadas son las de la landing", () => {
    const entradas = faq.mainEntity as { name: string }[];
    assert.deepEqual(entradas.map((e) => e.name), FAQS.map((f) => f.q));
  });
  test("se serializa sin perder nada", () => {
    for (const bloque of [org, app, faq]) {
      assert.deepEqual(JSON.parse(JSON.stringify(bloque)), bloque);
    }
  });
});
