// lib/escpos.ts — arma los bytes ESC/POS de un ticket para impresoras termicas
// (Epson TM-T20, Xprinter, 3nStar, Sam4s, genericas de 80 o 58 mm).
//
// Es logica pura: recibe el mismo TicketData que el ticket HTML y el ZPL, devuelve
// un Uint8Array. Quien lo manda a la impresora esta en lib/impresora/. Sin
// dependencias: todo el texto se translitera a ASCII para no depender de la
// pagina de codigos que tenga cargada cada impresora.
import type { TicketData } from "@/components/pos/ticket-print";
import type { PaymentMethod } from "@/lib/types";

/** Columnas de la fuente estandar (Font A, 12 puntos) segun el ancho del papel. */
export const COLUMNAS_80MM = 48;
export const COLUMNAS_58MM = 32;

export type AnchoPapel = 80 | 58;

export function columnasPorAncho(ancho: AnchoPapel): number {
  return ancho === 58 ? COLUMNAS_58MM : COLUMNAS_80MM;
}

export interface OpcionesEscPos {
  /** Columnas de texto. Default: 48 (80 mm). */
  columnas?: number;
  /** Manda el pulso al cajon antes de imprimir (cajon enchufado a la impresora). */
  abrirCajon?: boolean;
  /** Corte parcial al final. Default true. Las impresoras sin cuchilla lo ignoran. */
  cortar?: boolean;
}

const METODO_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mixto: "Mixto (efectivo + transferencia)",
  fiado: "Fiado",
  mercadopago: "Mercado Pago (QR)",
  tarjeta: "Tarjeta (posnet)",
  mercadopago_point: "Mercado Pago (Point)",
  debito: "Debito",
  credito: "Credito",
};

// ---- comandos ---------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Reset de la impresora. */
export const CMD_INIT = [ESC, 0x40];
/** Alineacion: 0 izquierda, 1 centro, 2 derecha. */
const alinear = (n: 0 | 1 | 2) => [ESC, 0x61, n];
const negrita = (on: boolean) => [ESC, 0x45, on ? 1 : 0];
/** GS ! n: 0 normal, 0x01 doble alto, 0x10 doble ancho, 0x11 ambos. */
const tamano = (n: 0x00 | 0x01 | 0x10 | 0x11) => [GS, 0x21, n];
const avanzar = (lineas: number) => [ESC, 0x64, Math.max(0, Math.min(255, lineas))];
/** Corte parcial con avance previo (GS V 66 n). */
export const CMD_CORTE = [GS, 0x56, 0x42, 0x00];
/**
 * Pulso al cajon: ESC p m t1 t2. m = pin del conector RJ11 (0 = pin 2, 1 = pin 5),
 * t1/t2 duracion en unidades de 2 ms. Se mandan los dos pines porque los cajones
 * genericos vienen cableados a cualquiera de ellos.
 */
export const CMD_ABRIR_CAJON = [ESC, 0x70, 0x00, 0x19, 0xfa, ESC, 0x70, 0x01, 0x19, 0xfa];

/** Solo el pulso del cajon (para el boton "Abrir cajon"). */
export function comandoAbrirCajon(): Uint8Array {
  return new Uint8Array([...CMD_INIT, ...CMD_ABRIR_CAJON]);
}

// ---- texto ------------------------------------------------------------------

/**
 * Saca acentos y signos que no existen en ASCII. Las impresoras baratas traen
 * paginas de codigos distintas; mandar solo ASCII imprime bien en todas.
 */
export function sinAcentos(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¡¿]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/★/g, "*")
    .replace(/[^\x20-\x7e]/g, "?");
}

/** Pesos sin Intl (deterministico en Node y navegador): $1.200 o $1.200,50. */
export function formatearPesos(monto: number): string {
  const n = Number.isFinite(monto) ? monto : 0;
  const negativo = n < 0;
  const totalCentavos = Math.round(Math.abs(n) * 100);
  const entero = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;
  const enteroTxt = entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = centavos > 0 ? `,${centavos.toString().padStart(2, "0")}` : "";
  return `${negativo ? "-" : ""}$${enteroTxt}${dec}`;
}

function dosDigitos(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatearFechaHora(fecha: Date): string {
  const d = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

/** Parte un texto en lineas de hasta `columnas`, cortando por palabra. */
export function partirLineas(texto: string, columnas: number): string[] {
  const limpio = sinAcentos(texto).replace(/\s+/g, " ").trim();
  if (!limpio) return [""];
  if (limpio.length <= columnas) return [limpio];
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of limpio.split(" ")) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > columnas && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
    while (actual.length > columnas) {
      lineas.push(actual.slice(0, columnas));
      actual = actual.slice(columnas);
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Texto a la izquierda y otro a la derecha en la misma linea, separados por espacios. */
export function lineaDosColumnas(izquierda: string, derecha: string, columnas: number): string {
  const der = sinAcentos(derecha);
  const maxIzq = Math.max(0, columnas - der.length - 1);
  let izq = sinAcentos(izquierda);
  if (izq.length > maxIzq) izq = izq.slice(0, maxIzq);
  const espacios = Math.max(1, columnas - izq.length - der.length);
  return `${izq}${" ".repeat(espacios)}${der}`;
}

/** Centra un texto en la linea (sin usar el comando de alineacion, por si la impresora no lo respeta). */
export function centrar(texto: string, columnas: number): string {
  const t = sinAcentos(texto).slice(0, columnas);
  const sobra = Math.max(0, columnas - t.length);
  return `${" ".repeat(Math.floor(sobra / 2))}${t}`;
}

function cantidadTexto(item: TicketData["items"][number]): string {
  return item.unidad === "kg" ? `${item.quantity.toFixed(2)}kg` : `${item.quantity}`;
}

/** Lineas de texto del ticket, sin comandos. Util para tests y para previsualizar. */
export function lineasTicket(ticket: TicketData, columnas: number): string[] {
  const sep = "-".repeat(columnas);
  const out: string[] = [];
  out.push(centrar(ticket.comercio?.trim() || "Ticket", columnas));
  out.push(centrar("Ticket no fiscal", columnas));
  out.push(centrar(formatearFechaHora(ticket.createdAt), columnas));
  if (ticket.saleNumber) out.push(centrar(`#${ticket.saleNumber}`, columnas));
  out.push(sep);
  for (const it of ticket.items) {
    out.push(...partirLineas(it.name, columnas));
    out.push(lineaDosColumnas(`  ${cantidadTexto(it)} x ${formatearPesos(it.price)}`, formatearPesos(it.subtotal), columnas));
  }
  out.push(sep);
  out.push(lineaDosColumnas("TOTAL", formatearPesos(ticket.total), columnas));
  out.push(`Pago: ${sinAcentos(METODO_LABEL[ticket.paymentMethod] ?? ticket.paymentMethod)}`);
  if (ticket.paymentMethod === "efectivo" && ticket.changeAmount > 0) out.push(`Vuelto: ${formatearPesos(ticket.changeAmount)}`);
  if (ticket.paymentMethod === "credito" && ticket.cuotas) out.push(`Cuotas: ${ticket.cuotas}`);
  if (ticket.paymentMethod === "credito" && ticket.recargoPct) out.push(`Recargo: ${ticket.recargoPct}%`);
  if (ticket.pagadorNombre) out.push(...partirLineas(`Pago: ${ticket.pagadorNombre}`, columnas));
  if (ticket.userName) out.push(...partirLineas(`Atendio: ${ticket.userName}`, columnas));
  if (ticket.ahorroOfertas && ticket.ahorroOfertas >= 1) {
    out.push(sep);
    out.push(centrar(`*** USTED AHORRO ${formatearPesos(ticket.ahorroOfertas)} ***`, columnas));
    out.push(centrar("con nuestras ofertas", columnas));
  }
  if (ticket.ofertasDestacadas?.length) {
    out.push(sep);
    out.push(centrar("HOY EN OFERTA", columnas));
    for (const o of ticket.ofertasDestacadas) out.push(...partirLineas(`* ${o}`, columnas));
  }
  out.push(sep);
  out.push(centrar("Gracias por su compra!", columnas));
  return out;
}

// ---- armado -----------------------------------------------------------------

class Escritor {
  private partes: number[] = [];
  bytes(...b: number[][]) {
    for (const parte of b) this.partes.push(...parte);
    return this;
  }
  texto(t: string) {
    const ascii = sinAcentos(t);
    for (let i = 0; i < ascii.length; i++) this.partes.push(ascii.charCodeAt(i) & 0x7f);
    return this;
  }
  linea(t = "") {
    return this.texto(t).bytes([LF]);
  }
  resultado(): Uint8Array {
    return new Uint8Array(this.partes);
  }
}

/** Bytes ESC/POS completos de un ticket de venta. */
export function generarTicketEscPos(ticket: TicketData, opciones: OpcionesEscPos = {}): Uint8Array {
  const columnas = opciones.columnas ?? COLUMNAS_80MM;
  const cortar = opciones.cortar ?? true;
  const sep = "-".repeat(columnas);
  const w = new Escritor().bytes(CMD_INIT);
  if (opciones.abrirCajon) w.bytes(CMD_ABRIR_CAJON);

  // Encabezado
  w.bytes(alinear(1), negrita(true), tamano(0x01)).linea(ticket.comercio?.trim() || "Ticket");
  w.bytes(tamano(0x00), negrita(false));
  w.linea("Ticket no fiscal");
  w.linea(formatearFechaHora(ticket.createdAt));
  if (ticket.saleNumber) w.linea(`#${ticket.saleNumber}`);
  w.bytes(alinear(0)).linea(sep);

  // Items
  for (const it of ticket.items) {
    for (const l of partirLineas(it.name, columnas)) w.linea(l);
    w.linea(lineaDosColumnas(`  ${cantidadTexto(it)} x ${formatearPesos(it.price)}`, formatearPesos(it.subtotal), columnas));
  }
  w.linea(sep);

  // Total y pago
  w.bytes(negrita(true), tamano(0x01)).linea(lineaDosColumnas("TOTAL", formatearPesos(ticket.total), columnas));
  w.bytes(tamano(0x00), negrita(false));
  w.linea(`Pago: ${METODO_LABEL[ticket.paymentMethod] ?? ticket.paymentMethod}`);
  if (ticket.paymentMethod === "efectivo" && ticket.changeAmount > 0) w.linea(`Vuelto: ${formatearPesos(ticket.changeAmount)}`);
  if (ticket.paymentMethod === "credito" && ticket.cuotas) w.linea(`Cuotas: ${ticket.cuotas}`);
  if (ticket.paymentMethod === "credito" && ticket.recargoPct) w.linea(`Recargo: ${ticket.recargoPct}%`);
  if (ticket.pagadorNombre) for (const l of partirLineas(`Pago: ${ticket.pagadorNombre}`, columnas)) w.linea(l);
  if (ticket.userName) for (const l of partirLineas(`Atendio: ${ticket.userName}`, columnas)) w.linea(l);

  // Ahorro y publicidad
  if (ticket.ahorroOfertas && ticket.ahorroOfertas >= 1) {
    w.linea(sep).bytes(alinear(1), negrita(true));
    w.linea(`*** USTED AHORRO ${formatearPesos(ticket.ahorroOfertas)} ***`);
    w.bytes(negrita(false)).linea("con nuestras ofertas").bytes(alinear(0));
  }
  if (ticket.ofertasDestacadas?.length) {
    w.linea(sep).bytes(alinear(1), negrita(true)).linea("HOY EN OFERTA").bytes(negrita(false), alinear(0));
    for (const o of ticket.ofertasDestacadas) for (const l of partirLineas(`* ${o}`, columnas)) w.linea(l);
  }

  // Pie
  w.linea(sep).bytes(alinear(1)).linea("Gracias por su compra!").bytes(alinear(0));
  w.bytes(avanzar(4));
  if (cortar) w.bytes(CMD_CORTE);
  return w.resultado();
}
