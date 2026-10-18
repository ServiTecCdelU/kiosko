// app/api/productos/fotos-automaticas/route.ts — busca fotos por codigo de barras en
// Open Food Facts para los productos que no tienen (admin y encargado).
// Procesa de a tandas (TANDA por pedido) para no pasarse del tiempo de una funcion; el
// navegador repite con `desde` hasta que `quedan` llega a 0. Solo se manda a Open Food
// Facts el codigo de barras: ningun dato del comercio.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { leerTodo } from "@/lib/server/leer-todo";
import { descargarFotoOpenFoodFacts, fotoOpenFoodFacts, guardarFotoProducto } from "@/lib/server/fotos-producto";

export const runtime = "nodejs";
export const maxDuration = 60;

const TANDA = 15;

/** Codigo de barras usable (EAN-8, UPC-A, EAN-13, GTIN-14; sin espacios ni guiones). */
function eanDe(codigo: unknown): string | null {
  const c = String(codigo ?? "").replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(c) ? c : null;
}

async function candidatos(comercioId: string) {
  const filas = await leerTodo<{ id: string; codigo_barras: string | null; image_url: string | null }>((desde, hasta) =>
    supabaseAdmin
      .from("productos")
      .select("id, codigo_barras, image_url")
      .eq("comercio_id", comercioId)
      .eq("disabled", false)
      .not("codigo_barras", "is", null)
      .order("id")
      .range(desde, hasta),
  );
  return filas.filter((p) => !p.image_url && eanDe(p.codigo_barras));
}

/** Cuantos productos sin foto tienen codigo de barras (para el boton). */
export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    return NextResponse.json({ pendientes: (await candidatos(comercioId)).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}

/**
 * Procesa la tanda que empieza en `desde` (posicion en la lista de candidatos de
 * ESTE momento: los que ya consiguieron foto salen de la lista, asi que el navegador
 * avanza `desde` solo por los que no se encontraron).
 */
export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const body = await req.json().catch(() => null);
  const desde = Math.max(0, Math.floor(Number(body?.desde) || 0));
  try {
    const lista = await candidatos(comercioId);
    const tanda = lista.slice(desde, desde + TANDA);
    let encontradas = 0;
    for (const p of tanda) {
      try {
        const url = await fotoOpenFoodFacts(eanDe(p.codigo_barras)!);
        if (!url) continue;
        const foto = await descargarFotoOpenFoodFacts(url);
        if (!foto) continue;
        await guardarFotoProducto(comercioId, p.id, foto.bytes, foto.mime, "off");
        encontradas++;
      } catch (e) {
        // Un producto que falla no corta la tanda.
        console.error("[fotos-automaticas]", p.id, e instanceof Error ? e.message : e);
      }
    }
    const noEncontradas = tanda.length - encontradas;
    return NextResponse.json({
      revisados: tanda.length,
      encontradas,
      // Proxima tanda: los encontrados ya no estan en la lista.
      siguiente: desde + noEncontradas,
      quedan: Math.max(0, lista.length - desde - tanda.length),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron buscar las fotos" }, { status: 400 });
  }
}
