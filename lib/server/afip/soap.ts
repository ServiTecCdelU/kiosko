// lib/server/afip/soap.ts — POST SOAP a los web services de AFIP (server-only).
//
// Produccion de AFIP (servicios1.afip.gov.ar) negocia TLS con parametros DH
// viejos que OpenSSL 3 rechaza ("dh key too small"); homologacion no. Por eso
// se usa un Agent con SECLEVEL=1 SOLO para estas conexiones (verificado
// 2026-10-03 contra FEDummy de los dos ambientes). El resto de la app no cambia.
import https from "node:https";
import { ErrorAfip } from "@/lib/afip/mensajes";

const agenteAfip = new https.Agent({ ciphers: "DEFAULT@SECLEVEL=1", keepAlive: true });
const TIMEOUT_MS = 25_000;

export function postSoap(url: string, sobre: string, soapAction: string): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent: agenteAfip,
        timeout: TIMEOUT_MS,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: soapAction,
          "Content-Length": Buffer.byteLength(sobre),
        },
      },
      (res) => {
        let cuerpo = "";
        res.setEncoding("utf8");
        res.on("data", (parte) => (cuerpo += parte));
        res.on("end", () => {
          // Los SOAP Fault vienen con 500 pero traen el motivo: se devuelven
          // para que los lea mensajes.ts. Otro 5xx sin XML es una caida.
          const status = res.statusCode ?? 0;
          if (status >= 500 && !/<(\w+:)?Envelope/.test(cuerpo)) {
            rechazar(new ErrorAfip(`AFIP no está respondiendo (HTTP ${status}). Probá en unos minutos.`, true));
          } else {
            resolver(cuerpo);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => rechazar(new ErrorAfip(`No se pudo conectar con AFIP (${e.message}). Probá en unos minutos.`, true)));
    req.end(sobre);
  });
}
