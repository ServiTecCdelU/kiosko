// lib/afip/xml.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { escaparXml, desescaparXml, extraer, bloques } from "./xml.ts";

describe("xml", () => {
  test("escapa los caracteres especiales (razones sociales con &, comillas...)", () => {
    assert.equal(escaparXml(`Pérez & Hijos <SRL> "x" 'y'`), "Pérez &amp; Hijos &lt;SRL&gt; &quot;x&quot; &apos;y&apos;");
  });

  test("ida y vuelta", () => {
    const t = `a & b < c > "d" 'e'`;
    assert.equal(desescaparXml(escaparXml(t)), t);
  });

  test("extrae ignorando prefijos de namespace y atributos", () => {
    const xml = `<soap:Body><ns1:CbteNro xmlns:ns1="x">42</ns1:CbteNro></soap:Body>`;
    assert.equal(extraer(xml, "CbteNro"), "42");
  });

  test("extrae XML escapado (asi viene la respuesta de WSAA)", () => {
    const xml = `<loginCmsReturn>&lt;token&gt;ABC&lt;/token&gt;</loginCmsReturn>`;
    assert.equal(extraer(extraer(xml, "loginCmsReturn")!, "token"), "ABC");
  });

  test("null si la etiqueta no esta", () => {
    assert.equal(extraer("<a>1</a>", "b"), null);
  });

  test("no confunde etiquetas que empiezan igual", () => {
    assert.equal(extraer("<CbteFch>20261003</CbteFch><Cbte>9</Cbte>", "Cbte"), "9");
  });

  test("bloques repetidos", () => {
    const xml = "<Errors><Err><Code>1</Code></Err><Err><Code>2</Code></Err></Errors>";
    assert.deepEqual(bloques(xml, "Err").map((b) => extraer(b, "Code")), ["1", "2"]);
  });
});
