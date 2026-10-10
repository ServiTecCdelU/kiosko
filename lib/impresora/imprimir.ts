// lib/impresora/imprimir.ts — punto unico de impresion del ticket desde el navegador.
//
// Elige el transporte segun la configuracion de esta PC (lib/impresora/config.ts):
//   navegador → el llamador abre window.print() (el ticket HTML ya esta en pantalla)
//   webusb    → bytes ESC/POS directo a la impresora USB
//   agente    → bytes ESC/POS al agente local, que escribe en la impresora de Windows o de red
//   zebra     → ZPL por /api/imprimir-ticket (solo tiene sentido con la app en esta misma PC)
import { apiUrl } from "@/lib/utils/api-url";
import type { TicketData } from "@/components/pos/ticket-print";
import type { PaymentMethod } from "@/lib/types";
import { columnasPorAncho, comandoAbrirCajon, generarTicketEscPos } from "@/lib/escpos";
import { leerConfigImpresora, modoPuedeAbrirCajon, type ConfigImpresora } from "@/lib/impresora/config";
import { enviarPorUsb } from "@/lib/impresora/webusb";
import { enviarAlAgente } from "@/lib/impresora/agente";
import { ticketDePrueba } from "@/lib/impresora/ticket-prueba";

/** "impreso": ya salio. "navegador": el llamador tiene que abrir window.print(). */
export type ResultadoImpresion = "impreso" | "navegador";

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

async function imprimirZebra(ticket: TicketData): Promise<void> {
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
  if (config.modo === "navegador") return "navegador";
  if (config.modo === "zebra") {
    await imprimirZebra(ticket);
    return "impreso";
  }
  const abrirCajon = config.cajonAlCobrar && cobroConEfectivo(ticket.paymentMethod);
  await enviarBytes(config, generarTicketEscPos(ticket, { columnas: columnasPorAncho(config.ancho), abrirCajon }));
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
