// lib/server/ofertas.ts — ofertas cargadas + como vienen vendiendo (server-only, service role).
// Lo consume /api/consultas/productos: accion "ofertas" (Centro de ofertas) y
// "sugerenciasOfertas" (Ofertas recomendadas).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hoyArgentinaISO, sumarDias } from "@/lib/oferta-vigencia";
import { DIAS_BASE, resultadoOferta, type ResultadoOferta, type VentaResumen } from "@/lib/oferta-resultados";
import { sugerirOferta, type SugerenciaOferta } from "@/lib/oferta-sugerencias";

/** Ofertas que empezaron hace mas de esto no se miden (la comparacion ya no dice nada). */
const DIAS_MAX_OFERTA = 90;
const PAGINA = 1000;
const PAGINAS_MAX = 30;

async function ventasDesde(comercioId: string, desde: string): Promise<VentaResumen[]> {
  const ventas: VentaResumen[] = [];
  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    const { data, error } = await supabaseAdmin
      .from("ventas")
      .select("created_at, items")
      .eq("comercio_id", comercioId)
      .eq("estado", "completada")
      .gte("created_at", `${desde}T00:00:00-03:00`)
      .order("created_at", { ascending: true })
      .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    for (const v of data ?? []) {
      ventas.push({
        fecha: hoyArgentinaISO(new Date(v.created_at)),
        items: (Array.isArray(v.items) ? v.items : []).map((i: Record<string, unknown>) => ({
          productId: String(i.productId ?? ""),
          quantity: Number(i.quantity) || 0,
          subtotal: Number(i.subtotal) || 0,
        })),
      });
    }
    if ((data ?? []).length < PAGINA) break;
  }
  return ventas;
}

export async function ofertasConResultados(comercioId: string): Promise<{
  productos: Record<string, any>[];
  resultados: Record<string, ResultadoOferta>;
}> {
  const { data, error } = await supabaseAdmin
    .from("productos")
    .select("*")
    .eq("comercio_id", comercioId)
    .eq("oferta_activa", true)
    .eq("disabled", false)
    .order("name", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const productos = data ?? [];

  // Solo se mide lo que ya arranco y tiene fecha de inicio conocida
  const hoy = hoyArgentinaISO();
  const limite = sumarDias(hoy, -DIAS_MAX_OFERTA);
  const medibles = productos.filter(
    (p) => typeof p.oferta_desde === "string" && p.oferta_desde <= hoy && p.oferta_desde >= limite,
  );
  if (medibles.length === 0) return { productos, resultados: {} };

  const primerInicio = medibles.reduce((min, p) => (p.oferta_desde < min ? p.oferta_desde : min), hoy);
  const ventas = await ventasDesde(comercioId, sumarDias(primerInicio, -DIAS_BASE));

  const resultados: Record<string, ResultadoOferta> = {};
  for (const p of medibles) {
    resultados[p.id] = resultadoOferta(ventas, p.id, p.oferta_desde, hoy);
  }
  return { productos, resultados };
}

/** Dias de ventas que se miran para recomendar ofertas. */
const DIAS_SUGERENCIAS = 30;
const MAX_SUGERENCIAS = 12;

/** Productos con stock y sin oferta, en paginas (PostgREST corta en 1000 filas). */
async function productosSinOferta(comercioId: string): Promise<Record<string, any>[]> {
  const filas: Record<string, any>[] = [];
  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    const { data, error } = await supabaseAdmin
      .from("productos")
      .select("*")
      .eq("comercio_id", comercioId)
      .eq("disabled", false)
      .eq("oferta_activa", false)
      .eq("stock_controlado", true)
      .gt("stock", 0)
      .order("id", { ascending: true })
      .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  return filas;
}

/** Que conviene ofertar: mercaderia quieta primero, ordenada por plata inmovilizada. */
export async function sugerenciasOfertas(comercioId: string): Promise<{
  items: { producto: Record<string, any>; sugerencia: SugerenciaOferta }[];
}> {
  const hoy = hoyArgentinaISO();
  const inicio = sumarDias(hoy, -DIAS_SUGERENCIAS);
  const [productos, ventas] = await Promise.all([productosSinOferta(comercioId), ventasDesde(comercioId, inicio)]);

  const vendidas = new Map<string, number>();
  for (const v of ventas) {
    for (const it of v.items) vendidas.set(it.productId, (vendidas.get(it.productId) ?? 0) + it.quantity);
  }

  const items: { producto: Record<string, any>; sugerencia: SugerenciaOferta }[] = [];
  for (const p of productos) {
    // Un producto dado de alta hace poco tiene menos historia: se mide sobre la que tiene
    const alta = p.created_at ? hoyArgentinaISO(new Date(p.created_at)) : inicio;
    const diasHistoria = Math.min(
      DIAS_SUGERENCIAS,
      Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${alta > inicio ? alta : inicio}T12:00:00Z`)) / 86_400_000),
    );
    const sugerencia = sugerirOferta({
      price: Number(p.price) || 0,
      precioBase: p.precio_base != null ? Number(p.precio_base) : undefined,
      stock: Number(p.stock) || 0,
      unidadesVendidas: vendidas.get(p.id) ?? 0,
      diasHistoria,
      unidad: p.unidad === "kg" ? "kg" : "un",
    });
    if (sugerencia) items.push({ producto: p, sugerencia });
  }

  items.sort((a, b) => b.sugerencia.capital - a.sugerencia.capital);
  return { items: items.slice(0, MAX_SUGERENCIAS) };
}
