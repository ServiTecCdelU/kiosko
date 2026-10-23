// lib/server/zpl.ts — genera el texto ZPL de un ticket con alto dinámico (^LL)
//
// Puro (corre en el navegador para el agente local y en el servidor para la Zebra
// compartida). Zebra ZD220 a 203 dpi = 8 puntos/mm, papel continuo de ticket.
// El alto de la etiqueta es exactamente lo impreso + MARGEN_INFERIOR: entre un
// ticket y el siguiente queda solo ese margen.
import { cantidadTexto } from "../cantidad.ts";
import { formatearFechaHora, formatearPesos } from "../escpos.ts";
import { formatearCuit } from "../ticket-negocio.ts";
import { comandoLogo } from "../zpl-logo.ts";
import type { TicketData } from "@/components/pos/ticket-print";

const METODO_LABEL: Record<TicketData["paymentMethod"], string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mixto: "Mixto (efectivo + transferencia)",
  fiado: "Fiado",
  mercadopago: "Mercado Pago (QR)",
  tarjeta: "Tarjeta (posnet)",
  mercadopago_point: "Mercado Pago (Point)",
  debito: "Débito",
  credito: "Crédito",
};

// Ancho de la etiqueta en puntos (203dpi, ~8pt/mm). Papel tipo posnet Mercado Pago (~48mm útiles).
export const ANCHO_PUNTOS = 384;
const MARGEN_IZQUIERDO = 12;
const MARGEN_SUPERIOR = 16;
/** 0,5 cm de papel en blanco al final (40 puntos a 203 dpi). */
export const MARGEN_INFERIOR = 40;
const ANCHO_UTIL = ANCHO_PUNTOS - MARGEN_IZQUIERDO * 2;

// Alto de letra (^A0) de cada tipo de renglon; el renglon ocupa la letra + INTERLINEA.
const LETRA_NOMBRE = 40;
const LETRA_TOTAL = 44;
const LETRA_NORMAL = 24;
const LETRA_CHICA = 22;
const INTERLINEA = 6;

function escaparZPL(texto: string): string {
  // ^ y ~ son caracteres de control ZPL; los reemplazamos para que no rompan el comando.
  return texto.replace(/\^/g, "-").replace(/~/g, "-").replace(/\s+/g, " ").trim();
}

// La fuente ^A0 (CG Triumvirate Bold Condensed) no es monoespaciada: el ancho de
// cada caracter se estima como fraccion del alto pedido, un poco por encima de lo
// real para que ningun renglon se pase del ancho (^FB con 1 linea lo encimaria).
function anchoCaracter(c: string): number {
  if (c === " ") return 0.3;
  if ("il.,:;'!|¡".includes(c)) return 0.3;
  if ("fjrt()-/".includes(c)) return 0.4;
  if ("mw".includes(c)) return 0.8;
  if ("MW%@".includes(c)) return 0.9;
  if (/[0-9$]/.test(c)) return 0.56;
  if (c !== c.toLowerCase()) return 0.64;
  return 0.54;
}

export function anchoTexto(texto: string, letra: number): number {
  let total = 0;
  for (const c of texto) total += anchoCaracter(c) * letra;
  return Math.ceil(total);
}

/** Lo que entra en `maxAncho` puntos; si no entra, se corta. */
function cortarAlAncho(texto: string, letra: number, maxAncho: number): string {
  let out = "";
  for (const c of texto) {
    if (anchoTexto(out + c, letra) > maxAncho) break;
    out += c;
  }
  return out.trimEnd();
}

/** Parte en renglones por palabra; una palabra mas larga que el renglon se corta a la fuerza. */
export function partirEnLineas(texto: string, letra: number, maxAncho: number = ANCHO_UTIL): string[] {
  const limpio = escaparZPL(texto);
  if (!limpio) return [];
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of limpio.split(" ")) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (anchoTexto(candidata, letra) <= maxAncho) {
      actual = candidata;
      continue;
    }
    if (actual) lineas.push(actual);
    actual = palabra;
    while (anchoTexto(actual, letra) > maxAncho) {
      const parte = cortarAlAncho(actual, letra, maxAncho) || actual.slice(0, 1);
      lineas.push(parte);
      actual = actual.slice(parte.length);
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

type Alineacion = "L" | "C" | "R";

export function generarZPL(ticket: TicketData): string {
  let y = MARGEN_SUPERIOR;
  // Donde termina lo ultimo impreso (sin la interlinea que le sigue).
  let fondo = MARGEN_SUPERIOR;
  let body = "";

  function campo(texto: string, letra: number, alineacion: Alineacion, opts: { negrita?: boolean; x?: number; ancho?: number } = {}) {
    const x = opts.x ?? MARGEN_IZQUIERDO;
    const ancho = opts.ancho ?? ANCHO_UTIL;
    // ^FB de 1 renglon y ancho fijo: alinea y nunca deja que el texto se salga del papel.
    const f = (dx: number) => `^FO${x + dx},${y}^A0N,${letra},${letra}^FB${ancho},1,0,${alineacion}^FD${texto}^FS\n`;
    body += f(0);
    // ^A0 ya es negrita; para el nombre y el total se reimprime corrido 1 punto y engorda.
    if (opts.negrita) body += f(1);
  }

  function avanzar(letra: number) {
    fondo = y + letra;
    y += letra + INTERLINEA;
  }

  function linea(texto: string, letra = LETRA_NORMAL, alineacion: Alineacion = "L", negrita = false) {
    for (const renglon of partirEnLineas(texto, letra)) {
      campo(renglon, letra, alineacion, { negrita });
      avanzar(letra);
    }
  }

  /** Texto a la izquierda y monto a la derecha en el mismo renglon. */
  function dosColumnas(izquierda: string, derecha: string, letra = LETRA_NORMAL, negrita = false) {
    const der = escaparZPL(derecha);
    const anchoIzq = Math.max(0, ANCHO_UTIL - anchoTexto(der, letra) - 12);
    campo(cortarAlAncho(escaparZPL(izquierda), letra, anchoIzq), letra, "L", { negrita, ancho: anchoIzq });
    campo(der, letra, "R", { negrita });
    avanzar(letra);
  }

  function separador() {
    y += 4;
    body += `^FO${MARGEN_IZQUIERDO},${y}^GB${ANCHO_UTIL},2,2^FS\n`;
    fondo = y + 2;
    y += 2 + 12;
  }

  // ---- Encabezado: logo, nombre, direccion, telefono, CUIT -------------------
  const enc = ticket.encabezado ?? {};
  if (enc.logo) {
    const anchoLogo = enc.logo.bytesPorFila * 8;
    const x = MARGEN_IZQUIERDO + Math.max(0, Math.floor((ANCHO_UTIL - anchoLogo) / 2));
    body += comandoLogo(enc.logo, x, y);
    fondo = y + enc.logo.alto;
    y += enc.logo.alto + 12;
  }
  linea(ticket.comercio?.trim() || "Ticket", LETRA_NOMBRE, "C", true);
  if (enc.direccion) linea(enc.direccion, LETRA_CHICA, "C");
  if (enc.telefono) linea(`Tel: ${enc.telefono}`, LETRA_CHICA, "C");
  if (enc.cuit) linea(`CUIT: ${formatearCuit(enc.cuit)}`, LETRA_CHICA, "C");
  separador();

  // ---- Datos de la venta --------------------------------------------------------
  const [fecha, hora] = formatearFechaHora(ticket.createdAt).split(" ");
  dosColumnas(`Fecha: ${fecha}`, `Hora: ${hora}`, LETRA_CHICA);
  if (ticket.saleNumber) linea(`Ticket N° ${ticket.saleNumber}`, LETRA_CHICA);
  if (ticket.userName) linea(`Cajero: ${ticket.userName}`, LETRA_CHICA);
  separador();

  // ---- Detalle ------------------------------------------------------------------
  for (const item of ticket.items) {
    linea(item.name, LETRA_NORMAL);
    const cantidad = cantidadTexto(item.quantity, item.unidad);
    const ahorro = item.ahorro && item.ahorro >= 0.01 ? item.ahorro : 0;
    // Con oferta se muestra a precio de lista y el descuento aparte: la cuenta cierra a la vista.
    const subtotalLista = item.subtotal + ahorro;
    const precioLista = ahorro && item.quantity > 0 ? subtotalLista / item.quantity : item.price;
    dosColumnas(`  ${cantidad} x ${formatearPesos(precioLista)}`, formatearPesos(subtotalLista), LETRA_CHICA);
    if (ahorro) dosColumnas("  Promo / descuento", `-${formatearPesos(ahorro)}`, LETRA_CHICA);
  }
  separador();

  // ---- Total y pago -----------------------------------------------------------
  dosColumnas("TOTAL", formatearPesos(ticket.total), LETRA_TOTAL, true);
  y += 4;
  linea(`Forma de pago: ${METODO_LABEL[ticket.paymentMethod] ?? ticket.paymentMethod}`, LETRA_CHICA);
  const conEfectivo = ticket.paymentMethod === "efectivo" || ticket.paymentMethod === "mixto";
  if (conEfectivo && ticket.cashAmount > 0) {
    dosColumnas(ticket.paymentMethod === "mixto" ? "Efectivo" : "Abonó", formatearPesos(ticket.cashAmount), LETRA_CHICA);
  }
  if (conEfectivo && ticket.changeAmount > 0) dosColumnas("Vuelto", formatearPesos(ticket.changeAmount), LETRA_CHICA);
  if (ticket.paymentMethod === "credito" && ticket.cuotas) linea(`Cuotas: ${ticket.cuotas}`, LETRA_CHICA);
  if (ticket.paymentMethod === "credito" && ticket.recargoPct) linea(`Recargo: ${ticket.recargoPct}%`, LETRA_CHICA);
  if (ticket.pagadorNombre) linea(`Pagó: ${ticket.pagadorNombre}`, LETRA_CHICA);

  // ---- Ahorro y publicidad --------------------------------------------------------
  if (ticket.ahorroOfertas && ticket.ahorroOfertas >= 1) {
    separador();
    linea(`USTED AHORRÓ ${formatearPesos(ticket.ahorroOfertas)}`, LETRA_NORMAL, "C");
    linea("con nuestras ofertas", LETRA_CHICA, "C");
  }
  if (ticket.ofertasDestacadas?.length) {
    separador();
    linea("HOY EN OFERTA", LETRA_NORMAL, "C");
    for (const o of ticket.ofertasDestacadas) linea(`* ${o}`, LETRA_CHICA);
  }

  // ---- Pie ----------------------------------------------------------------------
  separador();
  linea("¡Gracias por su compra!", LETRA_NORMAL, "C");
  linea("Ticket no válido como factura", LETRA_CHICA, "C");

  const alto = fondo + MARGEN_INFERIOR;

  // ^CI28: los ^FD van en UTF-8 (acentos, ¡, ñ). ^MNN papel continuo: la Zebra no
  // busca el gap de una etiqueta (eso es lo que dejaba papel de mas). ^MTD termica
  // directa, ^MMT corte manual, ^LH/^LT en cero: sin corrimientos ni avance extra.
  const cabecera = ["^XA", "^CI28", "^MNN", "^MTD", "^MMT", `^PW${ANCHO_PUNTOS}`, `^LL${alto}`, "^LH0,0", "^LT0", "^PON", "^PQ1"];
  return `${cabecera.join("\n")}\n${body}^XZ`;
}
