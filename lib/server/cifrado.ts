// lib/server/cifrado.ts — cifrado de secretos guardados en la base (server-only).
//
// AES-256-GCM: el tag de autenticacion detecta cualquier adulteracion del texto
// cifrado. La clave (MP_TOKEN_KEY, 32 bytes en base64) vive solo en las
// variables de entorno del servidor: la base guarda el cifrado, nunca la clave,
// asi que una fuga de la base sola no expone los secretos.
//
// Formato guardado: "v1:<iv>:<tag>:<datos>" (cada parte en base64). La version
// deja lugar a rotar algoritmo o clave sin ambiguedad.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITMO = "aes-256-gcm";
const LARGO_CLAVE = 32;
const LARGO_IV = 12; // recomendado para GCM

export function claveDesdeTexto(texto: string): Buffer {
  const clave = Buffer.from(texto.trim(), "base64");
  if (clave.length !== LARGO_CLAVE) {
    throw new Error("La clave de cifrado tiene que ser de 32 bytes en base64");
  }
  return clave;
}

/** Clave de los tokens de Mercado Pago. Falla claro si no esta configurada. */
export function claveTokensMP(): Buffer {
  const texto = process.env.MP_TOKEN_KEY;
  if (!texto) throw new Error("Falta configurar MP_TOKEN_KEY en el servidor");
  return claveDesdeTexto(texto);
}

export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const datos = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), datos.toString("base64")].join(":");
}

export function descifrar(cifrado: string, clave: Buffer): string {
  const partes = cifrado.split(":");
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error("Formato de secreto cifrado desconocido");
  }
  const [, iv, tag, datos] = partes;
  const decipher = createDecipheriv(ALGORITMO, clave, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(datos, "base64")), decipher.final()]).toString("utf8");
}
