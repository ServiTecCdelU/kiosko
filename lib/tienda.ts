// lib/tienda.ts — tienda online del plan Tienda, etapa 1: catalogo publico y pedido
// por WhatsApp (spec docs/superpowers/specs/2026-10-18-plan-tienda-design.md).
// Puro y testeado: lo usan la pagina publica, "Mi comercio" y la API publica.

export interface ConfigTienda {
  /** El dueño la abrio. Cerrada, la pagina dice "cerrada por ahora". */
  activa: boolean;
  /** WhatsApp donde llegan los pedidos (como lo tipea el dueño). */
  whatsapp: string;
  /** Texto de bienvenida arriba del catalogo. */
  mensaje: string;
  /** Mostrar los productos sin stock (como "Sin stock") o esconderlos. */
  mostrarSinStock: boolean;
  /** Formas de entrega que ofrece. */
  retiro: boolean;
  envio: boolean;
}

export const CONFIG_TIENDA_DEFAULT: ConfigTienda = {
  activa: false, whatsapp: "", mensaje: "", mostrarSinStock: false, retiro: true, envio: false,
};

const LARGO_MENSAJE = 300;

/** Lo que llega del navegador o de comercios.config.tienda, limpio. */
export function configTiendaValida(v: unknown): ConfigTienda {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const bool = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
  const retiro = bool(c.retiro, CONFIG_TIENDA_DEFAULT.retiro);
  const envio = bool(c.envio, CONFIG_TIENDA_DEFAULT.envio);
  return {
    activa: bool(c.activa, false),
    whatsapp: typeof c.whatsapp === "string" ? c.whatsapp.replace(/[^\d+\s()-]/g, "").trim().slice(0, 30) : "",
    mensaje: typeof c.mensaje === "string" ? c.mensaje.trim().slice(0, LARGO_MENSAJE) : "",
    mostrarSinStock: bool(c.mostrarSinStock, false),
    // Al menos una forma de entrega.
    retiro: retiro || !envio,
    envio,
  };
}

/**
 * Numero para wa.me (solo digitos, con 54 y el 9 de celular): "0343 15-456 7890",
 * "343 456-7890" o "+54 9 343 4567890" -> "5493434567890". null si no parece un
 * celular argentino ni un numero internacional completo.
 */
export function numeroWhatsapp(tel: string): string | null {
  let d = tel.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  } else if (tel.trim().startsWith("+") || d.startsWith("00")) {
    // Otro pais: se usa tal cual (sin el 00).
    const intl = d.replace(/^00/, "");
    return intl.length >= 8 && intl.length <= 15 ? intl : null;
  }
  if (d.startsWith("0")) d = d.slice(1);
  // "15" despues de la caracteristica (2 a 4 digitos): 343 15 4567890 -> 343 4567890.
  if (d.length === 12) {
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === "15") {
        d = d.slice(0, largoArea) + d.slice(largoArea + 2);
        break;
      }
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

export interface ItemPedido {
  nombre: string;
  cantidad: number;
  unidad: string;
  /** Precio por unidad o por kg, con la oferta del dia. */
  precio: number;
}

export interface DatosPedido {
  nombre: string;
  entrega: "retiro" | "envio";
  direccion?: string;
  pago: "efectivo" | "transferencia" | "mercadopago";
  nota?: string;
}

const PAGO_LABEL: Record<DatosPedido["pago"], string> = {
  efectivo: "Efectivo", transferencia: "Transferencia", mercadopago: "Mercado Pago",
};

const pesos = (n: number) =>
  "$" + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);

function cantidadTexto(cantidad: number, unidad: string): string {
  if (unidad === "un") return `${cantidad} x`;
  return `${String(cantidad).replace(".", ",")} ${unidad}`;
}

/** Subtotal estimado: lo de por kg se termina de cobrar al pesarlo. */
export function totalPedido(items: ItemPedido[]): number {
  return Math.round(items.reduce((s, i) => s + i.cantidad * i.precio, 0) * 100) / 100;
}

/** El mensaje que le llega al comercio por WhatsApp. */
export function mensajePedido(comercio: string, items: ItemPedido[], datos: DatosPedido): string {
  const hayPesables = items.some((i) => i.unidad !== "un");
  const lineas = [
    `Hola ${comercio}! Quiero hacer este pedido:`,
    "",
    ...items.map((i) => `• ${cantidadTexto(i.cantidad, i.unidad)} ${i.nombre} — ${pesos(i.cantidad * i.precio)}`),
    "",
    `Total${hayPesables ? " aproximado" : ""}: ${pesos(totalPedido(items))}`,
    "",
    `Nombre: ${datos.nombre.trim()}`,
    datos.entrega === "envio" ? `Envío a: ${(datos.direccion ?? "").trim()}` : "Retiro en el local",
    `Pago: ${PAGO_LABEL[datos.pago]}`,
  ];
  if (datos.nota?.trim()) lineas.push(`Nota: ${datos.nota.trim()}`);
  if (hayPesables) lineas.push("", "(Lo que va por kg se ajusta al pesarlo.)");
  return lineas.join("\n");
}

export function urlWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Paso de cantidad en el carrito: por unidad de a 1; por kg de a 250 g. */
export function pasoCantidad(unidad: string): number {
  return unidad === "un" ? 1 : 0.25;
}
