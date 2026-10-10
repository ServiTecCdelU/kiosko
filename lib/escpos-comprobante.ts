// lib/escpos-comprobante.ts — factura o nota de credito (A, B o C) en ESC/POS,
// con el QR de AFIP impreso por la propia termica (GS ( k). Mismo contenido que
// components/facturacion/comprobante-fiscal.tsx, que sigue siendo el fallback
// por navegador. Logica pura: recibe el comprobante ya autorizado.
// Imports relativos con extension: los tests corren con node:test sin alias.
import type { Comprobante } from "@/services/facturacion-service";
import { LETRA_CBTE, NOMBRE_CBTE } from "./afip/constantes.ts";
import { numeroComprobante } from "./afip/comprobante.ts";
import { CONDICION_EMISOR_LABEL } from "./afip/iva.ts";
import {
  CMD_CORTE, CMD_INIT, COLUMNAS_80MM, centrar, formatearPesos, lineaDosColumnas, partirLineas, sinAcentos,
} from "./escpos.ts";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const DOC_LABEL: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Consumidor final" };
const CONDICION_RECEPTOR_LABEL: Record<number, string> = {
  1: "IVA Responsable Inscripto", 4: "IVA Exento", 5: "Consumidor Final", 6: "Responsable Monotributo",
};

function dia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const pct = (n: number) => `${String(n).replace(".", ",")}%`;

/**
 * QR nativo de la impresora (modelo 2, correccion M). `tamano` es el ancho
 * de cada modulo en puntos (3 = ~3 cm para la URL de AFIP en 80 mm).
 */
export function comandoQr(datos: string, tamano = 3): number[] {
  const bytes = Array.from(new TextEncoder().encode(datos));
  const len = bytes.length + 3;
  return [
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,                 // modelo 2
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, tamano)), // tamano del modulo
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,                       // correccion M
    GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes, // guardar datos
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,                       // imprimir
  ];
}

export interface OpcionesComprobante {
  columnas?: number;
  cortar?: boolean;
}

interface Seccion {
  texto: string;
  centrado?: boolean;
  negrita?: boolean;
  doble?: boolean;
}

/** Renglones del comprobante (sin comandos). Util para tests y para previsualizar. */
export function seccionesComprobante(datos: Comprobante, columnas = COLUMNAS_80MM): Seccion[] {
  const { comprobante: c, emisor: e } = datos;
  const letra = LETRA_CBTE[c.cbteTipo] ?? "C";
  const sep = "-".repeat(columnas);
  const sumaItems = c.items.reduce((s, i) => s + i.subtotal, 0);
  const ajuste = Math.round((c.total - sumaItems) * 100) / 100;
  const conDesglose = letra === "A" && c.neto !== null && c.iva !== null;
  const factorNeto = conDesglose && c.total > 0 ? (c.neto! + (c.exento ?? 0)) / c.total : 1;
  const out: Seccion[] = [];
  // Todo en ASCII desde aca (igual que lineasTicket): lo que se ve es lo que se imprime.
  const centro = (t: string, extra: Partial<Seccion> = {}) => out.push({ texto: sinAcentos(t), centrado: true, ...extra });
  const linea = (t: string) => out.push({ texto: sinAcentos(t) });
  const dos = (i: string, d: string) => out.push({ texto: lineaDosColumnas(i, d, columnas) });

  centro(e.razonSocial, { negrita: true });
  centro(`CUIT ${e.cuit}`);
  for (const l of partirLineas(e.domicilio, columnas)) centro(l);
  if (e.ingresosBrutos) centro(`IIBB ${e.ingresosBrutos}`);
  centro(`Inicio de actividades ${dia(e.inicioActividades)}`);
  centro(CONDICION_EMISOR_LABEL[e.condicionIva] ?? "Responsable Monotributo");
  linea(sep);
  centro(letra, { negrita: true, doble: true });
  centro(`${NOMBRE_CBTE[c.cbteTipo]} (cod. ${String(c.cbteTipo).padStart(3, "0")})`, { negrita: true });
  centro(`N° ${numeroComprobante(c.puntoVenta, c.numero)}`);
  centro(`Fecha ${dia(c.fecha)}`);
  if (c.asociado) centro(`Asociada a ${NOMBRE_CBTE[c.asociado.cbteTipo]} ${numeroComprobante(c.asociado.puntoVenta, c.asociado.numero)}`);
  linea(sep);
  const receptor = `${DOC_LABEL[c.docTipo] ?? `Doc ${c.docTipo}`}${c.docTipo !== 99 ? ` ${c.docNro}` : ""}${c.receptorNombre ? ` - ${c.receptorNombre}` : ""}`;
  for (const l of partirLineas(receptor, columnas)) linea(l);
  if (letra !== "C") linea(CONDICION_RECEPTOR_LABEL[c.receptorCondicion] ?? "Consumidor Final");
  linea(sep);
  if (conDesglose) out.push({ texto: lineaDosColumnas("", "Precios sin IVA", columnas) });
  for (const it of c.items) {
    for (const l of partirLineas(it.nombre, columnas)) linea(l);
    dos(`  ${it.cantidad} x ${formatearPesos(it.precio * factorNeto)}`, formatearPesos(it.subtotal * factorNeto));
  }
  if (ajuste !== 0 && c.items.length > 0) dos(ajuste < 0 ? "Descuento" : "Recargo", formatearPesos(ajuste * factorNeto));
  linea(sep);
  if (conDesglose) {
    dos("Neto gravado", formatearPesos(c.neto!));
    for (const a of c.alicuotas) dos(`IVA ${pct(a.alicuota)}`, formatearPesos(a.importe));
    if (c.exento) dos("Exento", formatearPesos(c.exento));
  }
  out.push({ texto: lineaDosColumnas("TOTAL", formatearPesos(c.total), columnas), negrita: true, doble: true });
  if (letra === "B" && c.iva !== null) {
    for (const l of partirLineas("Regimen de transparencia fiscal al consumidor (Ley 27.743)", columnas)) linea(l);
    dos("IVA contenido", formatearPesos(c.iva));
    dos(columnas >= COLUMNAS_80MM ? "Otros impuestos nacionales indirectos" : "Otros imp. nacionales", formatearPesos(0));
  }
  linea(sep);
  linea(`CAE ${c.cae}`);
  linea(`Vto. CAE ${dia(c.caeVto)}`);
  if (c.ambiente === "homologacion") {
    for (const l of partirLineas("PRUEBA (homologacion) - SIN VALIDEZ FISCAL", columnas)) centro(l, { negrita: true });
  }
  linea("Comprobante autorizado por ARCA");
  return out;
}

/** Bytes ESC/POS del comprobante, con el QR de AFIP al pie. */
export function generarComprobanteEscPos(datos: Comprobante, opciones: OpcionesComprobante = {}): Uint8Array {
  const columnas = opciones.columnas ?? COLUMNAS_80MM;
  const bytes: number[] = [...CMD_INIT];
  const texto = (t: string) => {
    const ascii = sinAcentos(t);
    for (let i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 0x7f);
  };
  for (const s of seccionesComprobante(datos, columnas)) {
    bytes.push(ESC, 0x61, s.centrado ? 1 : 0);
    if (s.negrita) bytes.push(ESC, 0x45, 1);
    if (s.doble) bytes.push(GS, 0x21, 0x11);
    texto(s.doble && s.centrado ? sinAcentos(s.texto) : s.centrado ? centrar(s.texto, columnas).trimStart() : s.texto);
    bytes.push(LF);
    if (s.doble) bytes.push(GS, 0x21, 0x00);
    if (s.negrita) bytes.push(ESC, 0x45, 0);
  }
  bytes.push(ESC, 0x61, 1);
  bytes.push(...comandoQr(datos.comprobante.qr, columnas >= COLUMNAS_80MM ? 4 : 3));
  bytes.push(LF, ESC, 0x61, 0);
  bytes.push(ESC, 0x64, 4);
  if (opciones.cortar ?? true) bytes.push(...CMD_CORTE);
  return new Uint8Array(bytes);
}
