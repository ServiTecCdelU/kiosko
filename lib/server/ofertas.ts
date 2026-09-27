// lib/server/ofertas.ts — ofertas cargadas + como vienen vendiendo (server-only, service role).
// Lo consume /api/consultas/productos (accion "ofertas") para el Centro de ofertas.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hoyArgentinaISO, sumarDias } from "@/lib/oferta-vigencia";
import { DIAS_BASE, resultadoOferta, type ResultadoOferta, type VentaResumen } from "@/lib/oferta-resultados";

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
