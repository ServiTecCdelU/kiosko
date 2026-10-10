// lib/afip/mensajes.test.ts — correr con: npm test
// Las respuestas de ejemplo copian la estructura real de WSAA y WSFEv1.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  armarTRA, leerLoginCms, sobreSolicitarCAE, leerSolicitarCAE, leerUltimoAutorizado, leerConsultar,
  sobreUltimoAutorizado, ErrorAfip, type Auth,
} from "./mensajes.ts";

const auth: Auth = { token: "TOK", sign: "SIG&<", cuit: "20123456786" };

describe("WSAA", () => {
  test("el TRA usa hora argentina y una ventana de ±10 minutos", () => {
    const tra = armarTRA("wsfe", new Date("2026-10-03T15:00:00Z"));
    assert.match(tra, /<generationTime>2026-10-03T11:50:00-03:00<\/generationTime>/);
    assert.match(tra, /<expirationTime>2026-10-03T12:10:00-03:00<\/expirationTime>/);
    assert.match(tra, /<service>wsfe<\/service>/);
  });

  test("lee token, sign y vencimiento (vienen como XML escapado)", () => {
    const resp = `<soapenv:Envelope><soapenv:Body><loginCmsResponse><loginCmsReturn>&lt;?xml version="1.0"?&gt;
      &lt;loginTicketResponse&gt;&lt;header&gt;&lt;expirationTime&gt;2026-10-04T00:00:00.000-03:00&lt;/expirationTime&gt;&lt;/header&gt;
      &lt;credentials&gt;&lt;token&gt;PD94bWwg&lt;/token&gt;&lt;sign&gt;aBc+/=&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;
      </loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
    assert.deepEqual(leerLoginCms(resp), { token: "PD94bWwg", sign: "aBc+/=", expira: "2026-10-04T03:00:00.000Z" });
  });

  test("ya hay un acceso vigente: error reintentable", () => {
    const resp = `<soapenv:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soapenv:Fault>`;
    assert.throws(() => leerLoginCms(resp), (e: unknown) => e instanceof ErrorAfip && e.reintentable);
  });

  test("certificado no asociado a wsfe: mensaje que explica que hacer", () => {
    const resp = `<faultstring>coe.notAuthorized: Computador no autorizado a acceder al servicio</faultstring>`;
    assert.throws(() => leerLoginCms(resp), /Administrador de Relaciones/);
  });
});

describe("WSFEv1 — armado", () => {
  const base = { cbteTipo: 11, puntoVenta: 3, numero: 101, fecha: "2026-10-03", total: 1500, docTipo: 99, docNro: "0", condicionIva: 5 };

  test("Factura C: neto = total, IVA 0, condicion IVA del receptor, en el orden del XSD", () => {
    const x = sobreSolicitarCAE(auth, base);
    assert.match(x, /<ar:ImpTotal>1500\.00<\/ar:ImpTotal><ar:ImpTotConc>0\.00<\/ar:ImpTotConc><ar:ImpNeto>1500\.00<\/ar:ImpNeto>/);
    assert.match(x, /<ar:ImpIVA>0\.00<\/ar:ImpIVA><ar:MonId>PES<\/ar:MonId><ar:MonCotiz>1<\/ar:MonCotiz><ar:CondicionIVAReceptorId>5<\/ar:CondicionIVAReceptorId>/);
    assert.match(x, /<ar:CbteDesde>101<\/ar:CbteDesde><ar:CbteHasta>101<\/ar:CbteHasta><ar:CbteFch>20261003<\/ar:CbteFch>/);
    assert.ok(!x.includes("CbtesAsoc") && !x.includes("<ar:Iva>"));
  });

  test("Nota de credito C: lleva el comprobante asociado despues de la condicion IVA", () => {
    const x = sobreSolicitarCAE(auth, {
      ...base, cbteTipo: 13,
      asociado: { cbteTipo: 11, puntoVenta: 3, numero: 100, cuit: "20123456786", fecha: "2026-10-01" },
    });
    assert.match(x, /<\/ar:CondicionIVAReceptorId><ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>11<\/ar:Tipo><ar:PtoVta>3<\/ar:PtoVta><ar:Nro>100<\/ar:Nro><ar:Cuit>20123456786<\/ar:Cuit><ar:CbteFch>20261001<\/ar:CbteFch>/);
  });

  test("Factura A: neto, IVA y exento discriminados, con el array Iva despues de CbtesAsoc", () => {
    const x = sobreSolicitarCAE(auth, {
      ...base, cbteTipo: 1, docTipo: 80, docNro: "20123456786", condicionIva: 1, total: 1931,
      desglose: { neto: 1200, iva: 231, exento: 500, alicuotas: [{ id: 5, base: 1000, importe: 210 }, { id: 4, base: 200, importe: 21 }] },
    });
    assert.match(x, /<ar:ImpTotal>1931\.00<\/ar:ImpTotal><ar:ImpTotConc>0\.00<\/ar:ImpTotConc><ar:ImpNeto>1200\.00<\/ar:ImpNeto>/);
    assert.match(x, /<ar:ImpOpEx>500\.00<\/ar:ImpOpEx><ar:ImpTrib>0\.00<\/ar:ImpTrib><ar:ImpIVA>231\.00<\/ar:ImpIVA>/);
    assert.match(x, /<ar:CondicionIVAReceptorId>1<\/ar:CondicionIVAReceptorId><ar:Iva><ar:AlicIva><ar:Id>5<\/ar:Id><ar:BaseImp>1000\.00<\/ar:BaseImp><ar:Importe>210\.00<\/ar:Importe><\/ar:AlicIva><ar:AlicIva><ar:Id>4<\/ar:Id>/);
    assert.match(x, /<ar:CbteTipo>1<\/ar:CbteTipo>/);
  });

  test("Nota de credito B: CbtesAsoc antes de Iva; sin alicuotas (todo exento) no va el array", () => {
    const x = sobreSolicitarCAE(auth, {
      ...base, cbteTipo: 8, condicionIva: 5, total: 500,
      asociado: { cbteTipo: 6, puntoVenta: 3, numero: 7, cuit: "20123456786", fecha: "2026-10-01" },
      desglose: { neto: 0, iva: 0, exento: 500, alicuotas: [] },
    });
    assert.match(x, /<\/ar:CbteAsoc><\/ar:CbtesAsoc><\/ar:FECAEDetRequest>/);
    assert.match(x, /<ar:ImpNeto>0\.00<\/ar:ImpNeto><ar:ImpOpEx>500\.00<\/ar:ImpOpEx>/);
    assert.ok(!x.includes("<ar:Iva>"));
  });

  test("el sign se escapa (trae caracteres de base64 y podria traer otros)", () => {
    assert.match(sobreUltimoAutorizado(auth, 1, 11), /<ar:Sign>SIG&amp;&lt;<\/ar:Sign>/);
  });
});

describe("WSFEv1 — respuestas", () => {
  test("ultimo autorizado", () => {
    assert.equal(leerUltimoAutorizado(`<FECompUltimoAutorizadoResult><PtoVta>3</PtoVta><CbteTipo>11</CbteTipo><CbteNro>100</CbteNro></FECompUltimoAutorizadoResult>`), 100);
  });

  test("ultimo autorizado con error de AFIP", () => {
    assert.throws(
      () => leerUltimoAutorizado(`<Errors><Err><Code>11002</Code><Msg>El punto de venta no se encuentra habilitado</Msg></Err></Errors>`),
      /11002: El punto de venta no se encuentra habilitado/,
    );
  });

  test("CAE aprobado", () => {
    const r = leerSolicitarCAE(`<FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse>
      <Resultado>A</Resultado><CAE>76401234567890</CAE><CAEFchVto>20261013</CAEFchVto></FECAEDetResponse></FeDetResp>`);
    assert.deepEqual(r, { aprobado: true, cae: "76401234567890", vencimiento: "2026-10-13", observaciones: [] });
  });

  test("rechazado con observaciones", () => {
    const r = leerSolicitarCAE(`<FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado>
      <Observaciones><Obs><Code>10246</Code><Msg>Campo Condicion Frente al IVA del receptor es obligatorio</Msg></Obs></Observaciones>
      </FECAEDetResponse></FeDetResp>`);
    assert.deepEqual(r, { aprobado: false, motivo: "10246: Campo Condicion Frente al IVA del receptor es obligatorio" });
  });

  // Respuesta real de homologacion con un token invalido (2026-10-03).
  const TOKEN_INVALIDO = `<Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No valido token.</Msg></Err></Errors>`;

  test("token vencido o invalido (600) al pedir CAE: NO es un rechazo, hay que renovar el acceso", () => {
    assert.throws(() => leerSolicitarCAE(TOKEN_INVALIDO), (e: unknown) => e instanceof ErrorAfip && e.accesoInvalido && e.reintentable);
  });

  test("token invalido (600) en ultimo autorizado: idem", () => {
    assert.throws(() => leerUltimoAutorizado(TOKEN_INVALIDO), (e: unknown) => e instanceof ErrorAfip && e.accesoInvalido);
  });

  test("respuesta vacia o cortada: reintentable, no se marca como rechazo", () => {
    assert.throws(() => leerSolicitarCAE("<html>Service Unavailable</html>"), (e: unknown) => e instanceof ErrorAfip && e.reintentable);
  });

  test("consultar: existe", () => {
    const r = leerConsultar(`<ResultGet><CbteFch>20261003</CbteFch><ImpTotal>1500</ImpTotal><DocNro>0</DocNro>
      <CodAutorizacion>76401234567890</CodAutorizacion><FchVto>20261013</FchVto><Resultado>A</Resultado></ResultGet>`);
    assert.deepEqual(r, { existe: true, cae: "76401234567890", vencimiento: "2026-10-13", total: 1500, docNro: "0", fecha: "2026-10-03" });
  });

  test("consultar: 602 = no existe", () => {
    assert.deepEqual(leerConsultar(`<Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors>`), { existe: false });
  });
});
