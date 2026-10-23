// lib/impresora/imprimir.ts — punto unico de impresion del ticket desde el navegador.
//
// Elige el transporte segun la configuracion de esta PC (lib/impresora/config.ts):
//   ninguno   → no sale nada (kiosco sin ticketera)
//   navegador → el llamador abre window.print() (el ticket HTML ya esta en pantalla)
//   webusb    → bytes ESC/POS directo a la impresora USB
//   agente    → bytes ESC/POS al agente local, que escribe en la impresora de Windows o de red
//   zebra     → ZPL al agente local; sin agente, por /api/imprimir-ticket (app en esta misma PC)
import { apiUrl } from "@/lib/utils/api-url";
import type { TicketData } from "@/components/pos/ticket-print";
import type { PaymentMethod } from "@/lib/types";
import { columnasPorAncho, comandoAbrirCajon, generarTicketEscPos } from "@/lib/escpos";
import { generarComprobanteEscPos } from "@/lib/escpos-comprobante";
import type { Comprobante } from "@/services/facturacion-service";
import { leerConfigImpresora, modoPuedeAbrirCajon, type ConfigImpresora } from "@/lib/impresora/config";
import { enviarPorUsb } from "@/lib/impresora/webusb";
import { AgenteNoResponde, enviarAlAgente } from "@/lib/impresora/agente";
import { generarZPL } from "@/lib/server/zpl";
import { ticketDePrueba } from "@/lib/impresora/ticket-prueba";

/**
 * "impreso": ya salio. "navegador": el llamador tiene que abrir window.print().
 * "omitido": esta PC no imprime tickets (modo "ninguno").
 */
export type ResultadoImpresion = "impreso" | "navegador" | "omitido";

/** Metodos con los que el cajon se abre solo (hay efectivo de por medio). */
export function cobroConEfectivo(metodo: PaymentMethod): boolean {
  return metodo === "efectivo" || metodo === "mixto";
}

async function enviarBytes(config: ConfigImpresora, datos: Uint8Array): Promise<void> {
  if (config.modo === "webusb") return enviarPorUsb(datos);
  if (config.modo === "agente") {
    if (!config.agenteImpresora) throw new Error("Falta elegir la impresora del agente en “Impresora…”.");
    return enviarAlAgente(config.agenteUrl, config.agenteImpresora, datos);
  }
  throw new Error("Este modo de impresión no habla directo con la impresora.");
}

/**
 * La app esta en internet y no llega a la Zebra del local: el ZPL se arma aca y lo
 * escribe el agente. Sin agente queda la instalacion vieja, con la app corriendo en
 * la misma PC que la impresora (el servidor le escribe a la impresora compartida).
 */
async function imprimirZebra(ticket: TicketData, config: ConfigImpresora): Promise<void> {
  try {
    await enviarAlAgente(config.agenteUrl, config.zebraImpresora, new TextEncoder().encode(generarZPL(ticket)));
  } catch (e) {
    if (!(e instanceof AgenteNoResponde)) throw e;
    await imprimirZebraPorServidor(ticket).catch(() => {
      throw e;
    });
  }
}

async function imprimirZebraPorServidor(ticket: TicketData): Promise<void> {
  const res = await fetch(apiUrl("/api/imprimir-ticket"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticket),
  }).catch(() => null);
  if (!res) throw new Error("No se pudo conectar con la impresora Zebra");
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Error al imprimir el ticket" }));
    throw new Error(error ?? "Error al imprimir el ticket");
  }
}

/**
 * Imprime el ticket de una venta con la configuracion de esta PC. Lanza error si la
 * impresora no respondio (el llamador decide si cae al navegador).
 */
export async function imprimirTicket(ticket: TicketData, config: ConfigImpresora = leerConfigImpresora()): Promise<ResultadoImpresion> {
  if (config.modo === "ninguno") return "omitido";
  if (config.modo === "navegador") return "navegador";
  if (config.modo === "zebra") {
    await imprimirZebra(ticket, config);
    return "impreso";
  }
  const abrirCajon = config.cajonAlCobrar && cobroConEfectivo(ticket.paymentMethod);
  await enviarBytes(config, generarTicketEscPos(ticket, { columnas: columnasPorAncho(config.ancho), abrirCajon }));
  return "impreso";
}

/**
 * Factura o nota de credito autorizada, con el QR impreso por la termica.
 * Con "navegador" o "zebra" devuelve "navegador": el comprobante sale por
 * window.print() (la Zebra solo tiene el ticket no fiscal).
 */
export async function imprimirComprobante(datos: Comprobante, config: ConfigImpresora = leerConfigImpresora()): Promise<ResultadoImpresion> {
  if (!modoPuedeAbrirCajon(config.modo)) return "navegador";
  await enviarBytes(config, generarComprobanteEscPos(datos, { columnas: columnasPorAncho(config.ancho) }));
  return "impreso";
}

/** Pulso al cajon sin imprimir nada. */
export async function abrirCajon(config: ConfigImpresora = leerConfigImpresora()): Promise<void> {
  if (!modoPuedeAbrirCajon(config.modo)) {
    throw new Error("Para abrir el cajón desde la app hay que imprimir por USB o por el agente local.");
  }
  await enviarBytes(config, comandoAbrirCajon());
}

/** Ticket fijo para probar papel, ancho y cajon. */
export async function imprimirTicketDePrueba(comercio: string | undefined, config: ConfigImpresora = leerConfigImpresora()): Promise<ResultadoImpresion> {
  return imprimirTicket(ticketDePrueba(comercio), config);
}
