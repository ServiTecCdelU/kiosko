// app/api/publico/tienda/route.ts — catalogo publico de la tienda online (plan Tienda,
// etapa 1: pedido por WhatsApp). Sin sesion: lo ve cualquiera con el link.
//
// Solo lectura y solo lo que se puede mostrar al publico: nombre, precio de lista y
// oferta (el precio final lo calcula lib/pricing.ts igual que la caja), rubro, foto,
// unidad y si HAY stock. Nunca costo, margen, cantidad de stock ni nada del panel.
// La tienda abre si el plan la incluye, el dueño la activo y el comercio tiene acceso
// completo (sin prueba vencida, suspension ni deuda).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { leerTodo } from "@/lib/server/leer-todo";
import { accesoDeComercio } from "@/lib/server/acceso";
import { planIncluyeTienda } from "@/lib/suscripcion";
import { configTiendaValida, numeroWhatsapp } from "@/lib/tienda";

/** Tope del catalogo publico (una despensa grande tiene unos miles). */
const MAX_PRODUCTOS = 10_000;

const CAMPOS = "id, name, price, unidad, category, image_url, stock, stock_controlado, oferta_activa, oferta_tipo, oferta_valor, oferta_cantidad, oferta_desde, oferta_hasta";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "Tienda inexistente" }, { status: 404 });
  }

  const { data: comercio, error } = await supabaseAdmin
    .from("comercios")
    .select("id, nombre, plan, config")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar la tienda" }, { status: 500 });
  if (!comercio) return NextResponse.json({ error: "Tienda inexistente" }, { status: 404 });

  const tienda = configTiendaValida(comercio.config?.tienda);
  const whatsapp = numeroWhatsapp(tienda.whatsapp);
  const abierta = planIncluyeTienda(comercio.plan) && tienda.activa && !!whatsapp
    && (await accesoDeComercio(comercio.id)).nivel === "completo";
  if (!abierta) {
    return NextResponse.json({ abierta: false, nombre: comercio.nombre }, { headers: { "Cache-Control": "no-store" } });
  }

  let filas: Record<string, any>[];
  try {
    filas = await leerTodo<Record<string, any>>((desde, hasta) =>
      supabaseAdmin
        .from("productos")
        .select(CAMPOS)
        .eq("comercio_id", comercio.id)
        .eq("disabled", false)
        .gt("price", 0)
        .not("precio_libre", "is", true)
        .order("id")
        .range(desde, hasta),
      MAX_PRODUCTOS,
    );
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la tienda" }, { status: 500 });
  }

  const productos = filas
    .map((p) => ({
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
    }))
    .filter((p) => p.name && (tienda.mostrarSinStock || p.hayStock))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return NextResponse.json(
    {
      abierta: true,
      nombre: comercio.nombre,
      mensaje: tienda.mensaje,
      whatsapp,
      retiro: tienda.retiro,
      envio: tienda.envio,
      productos,
    },
    // Precios y stock cambian: cache corto en el CDN para aguantar visitas.
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
