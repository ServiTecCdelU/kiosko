// app/api/productos/foto/externa/route.ts — Open Food Facts para el alta con el lector
// (admin y encargado: queda bajo /api/productos/foto en RUTAS_GESTION).
//   GET  ?ean=...                 -> nombre sugerido y foto, si el codigo esta en la base
//   POST { productoId, url }      -> copia esa foto a nuestro almacenamiento y la asigna
// Solo se manda el codigo de barras: ningun dato del comercio.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { descargarFotoOpenFoodFacts, guardarFotoProducto, productoOpenFoodFacts } from "@/lib/server/fotos-producto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ean = new URL(req.url).searchParams.get("ean")?.replace(/[\s-]/g, "") ?? "";
  try {
    return NextResponse.json({ producto: await productoOpenFoodFacts(ean) });
  } catch {
    // Sin respuesta de Open Food Facts: el alta sigue a mano.
    return NextResponse.json({ producto: null });
  }
}

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const body = await req.json().catch(() => null);
  const productoId = String(body?.productoId ?? "");
  const url = String(body?.url ?? "");
  if (!productoId || !url.startsWith("https://")) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  try {
    const foto = await descargarFotoOpenFoodFacts(url);
    if (!foto) return NextResponse.json({ error: "No se pudo traer la foto" }, { status: 400 });
    return NextResponse.json({ ok: true, url: await guardarFotoProducto(comercioId, productoId, foto.bytes, foto.mime, "off") });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar la foto" }, { status: 400 });
  }
}
