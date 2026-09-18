// lib/server/zpl.ts — genera el texto ZPL de un ticket con alto dinámico (^LL)
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
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
const ANCHO_PUNTOS = 384;
const MARGEN_IZQUIERDO = 10;
const MARGEN_SUPERIOR = 20;
const MARGEN_INFERIOR = 40;

// Calibrar imprimiendo el ticket de prueba (ver lib/server/zpl-ticket-prueba.ts)
// y comparando el alto real impreso contra ^LL.
export const ALTO_POR_LINEA_NORMAL = 30;
export const ALTO_POR_LINEA_TITULO = 40;

function escaparZPL(texto: string): string {
  // ^ y ~ son caracteres de control ZPL; los reemplazamos para que no rompan el comando.
  return texto.replace(/\^/g, "-").replace(/~/g, "-");
}

// Factor empírico: ancho promedio de un caracter en la fuente escalable ^A0
// respecto del ancho pedido en el comando (nunca es monoespaciada real).
const FACTOR_ANCHO_CARACTER = 0.62;

function partirEnLineas(texto: string, anchoFuente: number, maxAncho: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxAncho / (anchoFuente * FACTOR_ANCHO_CARACTER)));
  if (texto.length <= maxChars) return [texto];

  const palabras = texto.split(" ");
  const lineas: string[] = [];
  let actual = "";

  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > maxChars && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
    // Palabra suelta más larga que una línea entera: la cortamos a la fuerza.
    while (actual.length > maxChars) {
      lineas.push(actual.slice(0, maxChars));
      actual = actual.slice(maxChars);
    }
  }
  if (actual) lineas.push(actual);

  return lineas;
}

export function generarZPL(ticket: TicketData): string {
  let y = MARGEN_SUPERIOR;
  let body = "";
  const anchoUtil = ANCHO_PUNTOS - MARGEN_IZQUIERDO * 2;

  function linea(texto: string, opts: { bold?: boolean; centrado?: boolean; tamano?: number } = {}) {
    const anchoFuente = opts.tamano ?? (opts.bold ? ALTO_POR_LINEA_TITULO - 5 : ALTO_POR_LINEA_NORMAL - 5);
    const font = `^A0N,${anchoFuente},${anchoFuente}`;
    const alturaLinea = opts.bold ? ALTO_POR_LINEA_TITULO : ALTO_POR_LINEA_NORMAL;
    const x = MARGEN_IZQUIERDO;

    for (const renglon of partirEnLineas(texto, anchoFuente, anchoUtil)) {
      const campo = opts.centrado
        ? `^FO${x},${y}^FB${anchoUtil},1,0,C${font}^FD${escaparZPL(renglon)}^FS\n`
        : `^FO${x},${y}${font}^FD${escaparZPL(renglon)}^FS\n`;
      body += campo;
      y += alturaLinea;
    }
  }

  function separador() {
    body += `^FO${MARGEN_IZQUIERDO},${y}^GB${ANCHO_PUNTOS - MARGEN_IZQUIERDO * 2},2,2^FS\n`;
    y += 15;
  }

  linea("Supermercado Patricia", { bold: true, centrado: true });
  linea("Ticket no fiscal", { centrado: true });
  linea(formatDateTime(ticket.createdAt), { centrado: true });
  linea(`#${ticket.saleNumber}`, { centrado: true });
  separador();

  for (const item of ticket.items) {
    linea(item.name, { tamano: ALTO_POR_LINEA_NORMAL - 6 });
    const cantidad = item.unidad === "kg" ? `${item.quantity.toFixed(2)}kg` : `${item.quantity}`;
    linea(`${cantidad} x ${formatCurrency(item.price)}   ${formatCurrency(item.subtotal)}`);
  }

  separador();
  linea(`TOTAL: ${formatCurrency(ticket.total)}`, { bold: true });
  linea(`Pago: ${METODO_LABEL[ticket.paymentMethod]}`);

  if (ticket.paymentMethod === "efectivo" && ticket.changeAmount > 0) {
    linea(`Vuelto: ${formatCurrency(ticket.changeAmount)}`);
  }
  if (ticket.paymentMethod === "credito" && ticket.cuotas) {
    linea(`Cuotas: ${ticket.cuotas}`);
  }
  if (ticket.paymentMethod === "credito" && ticket.recargoPct) {
    linea(`Recargo: ${ticket.recargoPct}%`);
  }
  if (ticket.pagadorNombre) {
    linea(`Pagó: ${ticket.pagadorNombre}`);
  }
  if (ticket.userName) {
    linea(`Atendió: ${ticket.userName}`);
  }

  separador();
  linea("¡Gracias por su compra!", { centrado: true });

  const alto = y + MARGEN_INFERIOR;

  // ^CI28: la impresora interpreta los ^FD como UTF-8 (acentos, ¡, ñ).
  return `^XA\n^CI28\n^PW${ANCHO_PUNTOS}\n^LL${alto}\n${body}^XZ`;
}
