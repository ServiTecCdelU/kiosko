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

/**
 * El mensaje que le llega al comercio por WhatsApp. Con `numero`, el pedido ya quedo
 * guardado en el sistema (etapa 2) y el mensaje es solo un aviso.
 */
export function mensajePedido(comercio: string, items: ItemPedido[], datos: DatosPedido, numero?: number): string {
  const hayPesables = items.some((i) => i.unidad !== "un");
  const lineas = [
    numero ? `Hola ${comercio}! Te hice el pedido N° ${numero} desde la tienda online:` : `Hola ${comercio}! Quiero hacer este pedido:`,
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

// ---- Etapa 2: pedidos guardados en el sistema (73_pedidos_tienda.sql) ----

export const ESTADOS_PEDIDO = ["nuevo", "preparando", "listo", "entregado", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const ESTADO_PEDIDO_LABEL: Record<EstadoPedido, string> = {
  nuevo: "Nuevo", preparando: "Preparando", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado",
};

/** A que estados se puede pasar desde cada uno. Entregado y cancelado son finales. */
const SIGUIENTES: Record<EstadoPedido, EstadoPedido[]> = {
  nuevo: ["preparando", "listo", "entregado", "cancelado"],
  preparando: ["listo", "entregado", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export function puedePasarA(de: EstadoPedido, a: EstadoPedido): boolean {
  return SIGUIENTES[de]?.includes(a) ?? false;
}

export function esEstadoPedido(v: unknown): v is EstadoPedido {
  return (ESTADOS_PEDIDO as readonly string[]).includes(v as string);
}

/** Lo que pide el cliente desde la tienda (el precio NO viene del navegador). */
export interface LineaPedida {
  productId: string;
  cantidad: number;
}

/** Subset de ConOferta (lib/pricing.ts), sin importar tipos de la app en este modulo puro. */
interface ConOfertaMinima {
  price: number;
  ofertaActiva?: boolean;
  ofertaTipo?: "monto" | "porcentaje" | "combo" | null;
  ofertaValor?: number | null;
  ofertaCantidad?: number | null;
  ofertaDesde?: string | null;
  ofertaHasta?: string | null;
}

/** Producto de la base, con lo necesario para cobrar. */
export interface ProductoPedible extends ConOfertaMinima {
  id: string;
  name: string;
  unidad: string;
  hayStock: boolean;
}

export interface ItemGuardado {
  productId: string;
  name: string;
  quantity: number;
  unidad: string;
  /** Precio por unidad/kg (con combo, el promedio de la linea). */
  price: number;
  subtotal: number;
}

export const MAX_LINEAS_PEDIDO = 60;
const MAX_UNIDADES = 100;
const MAX_KG = 50;

/**
 * Arma las lineas del pedido con los precios del servidor (`precioLinea` de
 * lib/pricing.ts, que se pasa para mantener este modulo sin dependencias).
 */
export function armarItemsPedido(
  lineas: LineaPedida[],
  productos: ProductoPedible[],
  precioLinea: (p: ProductoPedible, cantidad: number) => number,
): { items: ItemGuardado[]; total: number } | { error: string } {
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: "El pedido está vacío" };
  if (lineas.length > MAX_LINEAS_PEDIDO) return { error: `Un pedido puede tener hasta ${MAX_LINEAS_PEDIDO} productos` };
  const porId = new Map(productos.map((p) => [p.id, p]));
  const vistos = new Set<string>();
  const items: ItemGuardado[] = [];
  for (const l of lineas) {
    const p = porId.get(String(l?.productId));
    if (!p) return { error: "Un producto del pedido ya no está en la tienda. Actualizá la página." };
    if (vistos.has(p.id)) return { error: `${p.name} está repetido en el pedido` };
    vistos.add(p.id);
    if (!p.hayStock) return { error: `${p.name} se quedó sin stock` };
    const porUnidad = p.unidad === "un";
    const cantidad = porUnidad ? Number(l.cantidad) : Math.round(Number(l.cantidad) * 1000) / 1000;
    if (!Number.isFinite(cantidad) || cantidad <= 0 || (porUnidad && !Number.isInteger(cantidad))) {
      return { error: `Cantidad inválida para ${p.name}` };
    }
    if (cantidad > (porUnidad ? MAX_UNIDADES : MAX_KG)) {
      return { error: `Para pedir más de ${porUnidad ? MAX_UNIDADES : `${MAX_KG} ${p.unidad}`} de ${p.name}, escribile al comercio` };
    }
    const subtotal = Math.round(precioLinea(p, cantidad) * 100) / 100;
    items.push({
      productId: p.id, name: p.name, quantity: cantidad, unidad: p.unidad,
      price: Math.round((subtotal / cantidad) * 100) / 100, subtotal,
    });
  }
  return { items, total: Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100 };
}

export interface DatosCliente {
  nombre: string;
  telefono: string;
  entrega: "retiro" | "envio";
  direccion: string | null;
  pago: DatosPedido["pago"];
  nota: string | null;
}

/** Valida y limpia los datos del cliente con lo que ofrece la tienda. */
export function datosClienteValidos(v: unknown, tienda: Pick<ConfigTienda, "retiro" | "envio">): DatosCliente | { error: string } {
  const d = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const texto = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const nombre = texto(d.nombre, 60);
  if (nombre.length < 2) return { error: "Poné tu nombre" };
  const telefono = numeroWhatsapp(texto(d.telefono, 30));
  if (!telefono) return { error: "Poné un celular válido con característica (ej. 343 456-7890)" };
  const entrega = d.entrega === "envio" ? "envio" : d.entrega === "retiro" ? "retiro" : null;
  if (!entrega || (entrega === "envio" && !tienda.envio) || (entrega === "retiro" && !tienda.retiro)) {
    return { error: "Elegí cómo recibir el pedido" };
  }
  const direccion = texto(d.direccion, 150);
  if (entrega === "envio" && direccion.length < 4) return { error: "Poné la dirección de entrega" };
  const pago = d.pago === "transferencia" || d.pago === "mercadopago" || d.pago === "efectivo" ? d.pago : null;
  if (!pago) return { error: "Elegí cómo vas a pagar" };
  return {
    nombre, telefono, entrega,
    direccion: entrega === "envio" ? direccion : null,
    pago,
    nota: texto(d.nota, 200) || null,
  };
}

/** Mensaje para avisarle al cliente por WhatsApp desde la pantalla Pedidos. */
export function mensajeEstadoPedido(
  estado: EstadoPedido, numero: number, comercio: string, entrega: "retiro" | "envio", nombre: string,
): string | null {
  const hola = `Hola ${nombre.split(" ")[0]}! Te escribimos de ${comercio}.`;
  switch (estado) {
    case "nuevo": return `${hola} Recibimos tu pedido N° ${numero}. Te avisamos cuando esté ${entrega === "envio" ? "en camino" : "listo para retirar"}.`;
    case "preparando": return `${hola} Ya estamos preparando tu pedido N° ${numero}.`;
    case "listo": return entrega === "envio"
      ? `${hola} Tu pedido N° ${numero} está listo y sale para tu casa.`
      : `${hola} Tu pedido N° ${numero} está listo para retirar.`;
    case "entregado": return `${hola} ¡Gracias por tu compra! (pedido N° ${numero})`;
    case "cancelado": return `${hola} No podemos preparar tu pedido N° ${numero}. Escribinos si querés cambiar algo.`;
    default: return null;
  }
}

// ---- Etapa 3: pago online con Mercado Pago (74_pedidos_pago_online.sql) ----

export type EstadoPagoPedido = "pendiente" | "aprobado" | "rechazado";

/**
 * external_reference del cobro de un pedido. El webhook de MP la usa para separar los
 * pedidos de los cobros con QR de la caja (que van a pagos_mp_pendientes).
 */
const PREFIJO_REF_PEDIDO = "pedido:";

export function referenciaPagoPedido(pedidoId: string): string {
  return `${PREFIJO_REF_PEDIDO}${pedidoId}`;
}

/** Id del pedido de una external_reference, o null si no es de un pedido. */
export function pedidoDeReferencia(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith(PREFIJO_REF_PEDIDO)) return null;
  const id = ref.slice(PREFIJO_REF_PEDIDO.length);
  return id ? id : null;
}

/** Estado del pago de un pedido segun el status de MP (null: no cambia nada). */
export function estadoPagoDeMP(status: string): EstadoPagoPedido | null {
  if (status === "approved") return "aprobado";
  if (status === "rejected" || status === "cancelled") return "rechazado";
  if (status === "pending" || status === "in_process" || status === "authorized") return "pendiente";
  return null;
}

/** Lo pagado cubre el pedido (al centavo). */
export function pagoCubrePedido(pagado: number, total: number): boolean {
  return Number.isFinite(pagado) && pagado + 0.009 >= total;
}
