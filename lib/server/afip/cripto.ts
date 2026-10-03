// lib/server/afip/cripto.ts — certificados y firma para AFIP (server-only).
//
// node-forge se usa SOLO para firmar (CMS/PKCS#7 de WSAA) y generar el CSR.
// No se usa su verificacion de firmas RSA (aviso GHSA-86w9-cpqp-85rv, que
// afecta verificar, no firmar): el certificado se valida comparando la clave
// publica con la nuestra. La clave RSA la genera crypto nativo (mucho mas rapido).
import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";

const OID_SERIAL_NUMBER = "2.5.4.5";

export interface ClaveYCsr {
  clavePem: string;
  csrPem: string;
}

/**
 * Clave privada RSA 2048 + pedido de certificado (CSR) con el formato que pide
 * AFIP: serialNumber = "CUIT <cuit>", CN = alias, O = razon social.
 */
export function generarClaveYCsr(datos: { cuit: string; razonSocial: string; alias: string }): ClaveYCsr {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const clavePem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const clave = forge.pki.privateKeyFromPem(clavePem);

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(clave.n, clave.e);
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: datos.razonSocial.slice(0, 64) },
    { name: "commonName", value: datos.alias.slice(0, 64) },
    { type: OID_SERIAL_NUMBER, value: `CUIT ${datos.cuit}` },
  ]);
  csr.sign(clave, forge.md.sha256.create());
  return { clavePem, csrPem: forge.pki.certificationRequestToPem(csr) };
}

export type ResultadoCertificado =
  | { ok: true; vence: Date; emisor: string }
  | { ok: false; error: string };

/** El certificado que devolvio AFIP corresponde a nuestra clave y a la CUIT, y esta vigente. */
export function validarCertificado(certPem: string, clavePem: string, cuit: string, ahora: Date = new Date()): ResultadoCertificado {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    return { ok: false, error: "El archivo no es un certificado válido (.crt / .pem)" };
  }
  const clave = forge.pki.privateKeyFromPem(clavePem);
  const publica = cert.publicKey as forge.pki.rsa.PublicKey;
  if (!publica.n || publica.n.compareTo(clave.n) !== 0 || publica.e.compareTo(clave.e) !== 0) {
    return { ok: false, error: "Ese certificado no corresponde al pedido generado acá. Subí el que te dio AFIP para este pedido." };
  }
  const serial = cert.subject.getField({ type: OID_SERIAL_NUMBER })?.value as string | undefined;
  if (serial && !serial.replace(/\D/g, "").includes(cuit)) {
    return { ok: false, error: `El certificado es de otra CUIT (${serial})` };
  }
  if (cert.validity.notAfter.getTime() <= ahora.getTime()) {
    return { ok: false, error: "El certificado está vencido. Generá un pedido nuevo." };
  }
  const emisor = String(cert.issuer.getField("CN")?.value ?? cert.issuer.getField("O")?.value ?? "");
  return { ok: true, vence: cert.validity.notAfter, emisor };
}

/** CMS firmado (con el contenido adentro) del pedido de acceso, en base64. */
export function firmarCms(contenido: string, certPem: string, clavePem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(contenido, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clavePem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
