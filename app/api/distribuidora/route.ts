// app/api/distribuidora/route.ts — mover stock entre el comercio y la distribuidora
// desde la pantalla "Distribuidora" (admin y encargado: RUTAS_GESTION).
//   transferir { productoId, cantidad, direccion } · reintentar
import { NextResponse } from "next/server";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { estaVinculado, reintentarAbiertas, transferir } from "@/lib/server/distribuidora-stock";
import { cantidadTransferible, esDireccion } from "@/lib/stock-distribuidora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const body = await req.json().catch(() => null);
  try {
    if (!(await estaVinculado(comercioId))) {
      return NextResponse.json({ error: "Este comercio no está vinculado a la distribuidora" }, { status: 403 });
    }
    if (body?.accion === "reintentar") {
      return NextResponse.json({ transferencias: await reintentarAbiertas(comercioId) });
    }
    if (body?.accion === "transferir") {
      const cantidad = cantidadTransferible(body.cantidad);
      if (!cantidad) return NextResponse.json({ error: "La cantidad tiene que ser un número entero mayor a 0" }, { status: 400 });
      if (!esDireccion(body.direccion)) return NextResponse.json({ error: "Dirección inválida" }, { status: 400 });
      if (typeof body.productoId !== "string" || !body.productoId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
      const transferencia = await transferir(comercioId, {
        productoId: body.productoId,
        cantidad,
        direccion: body.direccion,
        usuario: getSesion(req)?.nombre ?? null,
        pedidaEn: "comercio",
      });
      return NextResponse.json({ transferencia });
    }
    return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
