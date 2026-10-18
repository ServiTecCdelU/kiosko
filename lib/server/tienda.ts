// lib/server/tienda.ts — la tienda online de un slug y si esta abierta (server-only).
// Lo comparten el catalogo publico y el alta de pedidos: la misma regla en los dos.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { accesoDeComercio } from "@/lib/server/acceso";
import { leerTodo } from "@/lib/server/leer-todo";
import { estadoConexionMP } from "@/lib/server/mercadopago-credencial";
import { planIncluyeTienda } from "@/lib/suscripcion";
import { configTiendaValida, estadoPagoDeMP, numeroWhatsapp, type ConfigTienda } from "@/lib/tienda";

export interface TiendaDeSlug {
  comercioId: string;
  nombre: string;
  config: ConfigTienda;
  /** Numero para wa.me ("549..."); null si el cargado no sirve. */
  whatsapp: string | null;
  /** Plan con tienda, activada por el dueño, WhatsApp valido y acceso completo. */
  abierta: boolean;
  /** Puede cobrar online: Mercado Pago del comercio conectado (74_pedidos_pago_online.sql). */
  pagoOnline: boolean;
}

export function slugValido(slug: unknown): slug is string {
  return typeof slug === "string" && /^[a-z0-9-]{1,80}$/.test(slug);
}

/** null si el slug no existe. Tira si la base falla. */
export async function tiendaDeSlug(slug: string): Promise<TiendaDeSlug | null> {
  const { data, error } = await supabaseAdmin
    .from("comercios")
    .select("id, nombre, plan, config")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const config = configTiendaValida(data.config?.tienda);
  const whatsapp = numeroWhatsapp(config.whatsapp);
  const abierta = planIncluyeTienda(data.plan) && config.activa && !!whatsapp
    && (await accesoDeComercio(data.id)).nivel === "completo";
  const pagoOnline = abierta && (await estadoConexionMP(data.id).catch(() => null))?.conectado === true;
  return { comercioId: data.id, nombre: data.nombre, config, whatsapp, abierta, pagoOnline };
}

/** Tope del catalogo publico (una despensa grande tiene unos miles). */
const MAX_PRODUCTOS = 10_000;

const CAMPOS = "id, name, price, unidad, category, image_url, stock, stock_controlado, oferta_activa, oferta_tipo, oferta_valor, oferta_cantidad, oferta_desde, oferta_hasta";

/** Lo unico que se muestra al publico de un producto (nunca costo ni cantidad de stock). */
export interface ProductoPublico {
  id: string;
  name: string;
  price: number;
  unidad: string;
  category: string;
  imageUrl: string | null;
  hayStock: boolean;
  ofertaActiva: boolean;
  ofertaTipo: "monto" | "porcentaje" | "combo" | null;
  ofertaValor: number | null;
  ofertaCantidad: number | null;
  ofertaDesde: string | null;
  ofertaHasta: string | null;
}

function aPublico(p: Record<string, any>): ProductoPublico {
  return {
    id: String(p.id),
    name: String(p.name ?? ""),
    price: Number(p.price) || 0,
    unidad: String(p.unidad ?? "un"),
    category: String(p.category ?? "").split(" / ")[0] || "Otros",
    imageUrl: p.image_url || null,
    hayStock: p.stock_controlado === false || Number(p.stock) > 0,
    ofertaActiva: !!p.oferta_activa,
    ofertaTipo: p.oferta_tipo ?? null,
    ofertaValor: p.oferta_valor != null ? Number(p.oferta_valor) : null,
    ofertaCantidad: p.oferta_cantidad != null ? Number(p.oferta_cantidad) : null,
    ofertaDesde: p.oferta_desde ? String(p.oferta_desde).slice(0, 10) : null,
    ofertaHasta: p.oferta_hasta ? String(p.oferta_hasta).slice(0, 10) : null,
  };
}

/**
 * Productos que se venden en la tienda: activos, con precio y sin precio libre.
 * Con `ids`, solo esos (para validar un pedido).
 */
export async function productosDeTienda(comercioId: string, ids?: string[]): Promise<ProductoPublico[]> {
  const filas = await leerTodo<Record<string, any>>((desde, hasta) => {
    let q = supabaseAdmin
      .from("productos")
      .select(CAMPOS)
      .eq("comercio_id", comercioId)
      .eq("disabled", false)
      .gt("price", 0)
      .not("precio_libre", "is", true);
    if (ids) q = q.in("id", ids);
    return q.order("id").range(desde, hasta);
  }, MAX_PRODUCTOS);
  return filas.map(aPublico).filter((p) => p.name);
}

/**
 * El webhook de Mercado Pago avisa el pago de un pedido (external_reference
 * "pedido:<id>", lib/tienda.ts). `pago` ya viene consultado a MP con el token del
 * comercio: un aviso falso no puede marcar pagado un pedido. Idempotente.
 */
export async function registrarPagoDePedido(
  comercios: string[],
  pedidoId: string,
  pago: { id: string; status: string; monto: number },
): Promise<void> {
  const nuevo = estadoPagoDeMP(pago.status);
  if (!nuevo) return;
  const { data: pedido, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, comercio_id, pago_estado")
    .in("comercio_id", comercios)
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Ya aprobado: MP repite avisos; no se pisa con un estado viejo.
  if (!pedido || pedido.pago_estado === "aprobado") return;
  const { error: errorUpd } = await supabaseAdmin
    .from("pedidos")
    .update({
      pago_estado: nuevo,
      pago_id: pago.id,
      ...(nuevo === "aprobado" ? { pago_monto: pago.monto } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("comercio_id", pedido.comercio_id)
    .eq("id", pedido.id);
  if (errorUpd) throw new Error(errorUpd.message);
}
