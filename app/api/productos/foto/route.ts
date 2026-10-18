// app/api/productos/foto/route.ts — subir o quitar la foto de un producto.
// Admin y encargado (RUTAS_GESTION en lib/permisos-api.ts), como cambiar precios.
// POST: multipart con "productoId" y "foto" (ya achicada en el navegador, lib/foto-producto.ts).
// DELETE: { productoId }.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { guardarFotoProducto, MAX_BYTES_FOTO, quitarFotoProducto } from "@/lib/server/fotos-producto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const form = await req.formData().catch(() => null);
  const productoId = String(form?.get("productoId") ?? "");
  const foto = form?.get("foto");
  if (!productoId || !(foto instanceof Blob)) {
    return NextResponse.json({ error: "Faltan el producto o la foto" }, { status: 400 });
  }
  if (foto.size > MAX_BYTES_FOTO) return NextResponse.json({ error: "La foto pesa más de 2 MB" }, { status: 400 });
  try {
    const url = await guardarFotoProducto(comercioId, productoId, new Uint8Array(await foto.arrayBuffer()), foto.type);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar la foto" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const body = await req.json().catch(() => null);
  const productoId = String(body?.productoId ?? "");
  if (!productoId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  try {
    await quitarFotoProducto(comercioId, productoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo quitar la foto" }, { status: 400 });
  }
}
