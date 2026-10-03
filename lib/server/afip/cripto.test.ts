// lib/server/afip/cripto.test.ts — correr con: npm test
// Simula a AFIP con una CA de prueba: firma el CSR generado y valida el CMS.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createVerify, X509Certificate } from "node:crypto";
import forge from "node-forge";
import { generarClaveYCsr, validarCertificado, firmarCms } from "./cripto.ts";

const CUIT = "20123456786";

/** "AFIP de mentira": emite un certificado a partir del CSR. */
function emitir(csrPem: string, opciones: { dias?: number; cuitSujeto?: string } = {}): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey!;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + (opciones.dias ?? 365) * 86_400_000);
  const sujeto = csr.subject.attributes.map((a) =>
    a.type === "2.5.4.5" && opciones.cuitSujeto ? { ...a, value: `CUIT ${opciones.cuitSujeto}` } : a,
  );
  cert.setSubject(sujeto);
  cert.setIssuer([{ name: "commonName", value: "Computadores Test" }]);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

const generado = generarClaveYCsr({ cuit: CUIT, razonSocial: "Kiosco El Sol & Cía", alias: "kiosco-el-sol" });

describe("generarClaveYCsr", () => {
  test("CSR firmado, con CUIT, razon social y alias", () => {
    const csr = forge.pki.certificationRequestFromPem(generado.csrPem);
    assert.equal(csr.verify(), true);
    assert.equal(csr.subject.getField({ type: "2.5.4.5" }).value, `CUIT ${CUIT}`);
    assert.equal(csr.subject.getField("O").value, "Kiosco El Sol & Cía");
    assert.equal(csr.subject.getField("CN").value, "kiosco-el-sol");
    assert.match(generado.clavePem, /BEGIN RSA PRIVATE KEY/);
  });
});

describe("validarCertificado", () => {
  test("acepta el certificado emitido para este pedido", () => {
    const r = validarCertificado(emitir(generado.csrPem), generado.clavePem, CUIT);
    assert.ok(r.ok && r.vence > new Date() && r.emisor === "Computadores Test");
  });

  test("rechaza un certificado de OTRO pedido (otra clave)", () => {
    const otro = generarClaveYCsr({ cuit: CUIT, razonSocial: "X", alias: "x" });
    const r = validarCertificado(emitir(otro.csrPem), generado.clavePem, CUIT);
    assert.ok(!r.ok && /no corresponde/.test(r.error));
  });

  test("rechaza un certificado de otra CUIT", () => {
    const r = validarCertificado(emitir(generado.csrPem, { cuitSujeto: "30500010912" }), generado.clavePem, CUIT);
    assert.ok(!r.ok && /otra CUIT/.test(r.error));
  });

  test("rechaza un certificado vencido", () => {
    const r = validarCertificado(emitir(generado.csrPem, { dias: -1 }), generado.clavePem, CUIT);
    assert.ok(!r.ok && /vencido/.test(r.error));
  });

  test("rechaza algo que no es un certificado", () => {
    assert.equal(validarCertificado("hola", generado.clavePem, CUIT).ok, false);
  });
});

describe("firmarCms", () => {
  test("CMS SignedData con el TRA adentro, firmado con nuestra clave (verificado con crypto nativo)", () => {
    const certPem = emitir(generado.csrPem);
    const tra = "<loginTicketRequest><service>wsfe</service></loginTicketRequest>";
    const der = forge.util.decode64(firmarCms(tra, certPem, generado.clavePem));
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der)) as forge.pkcs7.PkcsSignedData & { rawCapture: any };

    // contenido incluido (no "detached"), como exige WSAA
    assert.equal(p7.rawCapture.content.value[0].value, tra);
    // certificado incluido
    assert.equal(p7.certificates.length, 1);

    // la firma de los atributos autenticados verifica con la clave publica del certificado
    const attrs = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, p7.rawCapture.authenticatedAttributes);
    const v = createVerify("sha256");
    v.update(Buffer.from(forge.asn1.toDer(attrs).getBytes(), "binary"));
    const pub = new X509Certificate(certPem).publicKey;
    assert.equal(v.verify(pub, Buffer.from(p7.rawCapture.signature, "binary")), true);
  });
});
