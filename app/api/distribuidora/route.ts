// app/api/distribuidora/route.ts — mover stock entre el comercio y la distribuidora
// desde la pantalla "Distribuidora" (admin y encargado: RUTAS_GESTION).
//   transferir { distId, cantidad, direccion } · transferir_varios { items: [{ distId, cantidad }], direccion } · reintentar
import { NextResponse } from "next/server";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { estaVinculado, reintentarAbiertas, transferir, transferirVarios } from "@/lib/server/distribuidora-stock";
import { esDireccion, leerItems } from "@/lib/stock-distribuidora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pasar muchos productos de una son dos llamadas por producto (una por base).
export const maxDuration = 300;

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
    if (body?.accion === "transferir" || body?.accion === "transferir_varios") {
      if (!esDireccion(body.direccion)) return NextResponse.json({ error: "Dirección inválida" }, { status: 400 });
      const items = leerItems(body);
      if (typeof items === "string") return NextResponse.json({ error: items }, { status: 400 });
      const comun = { direccion: body.direccion, usuario: getSesion(req)?.nombre ?? null, pedidaEn: "comercio" as const };
      if (body.accion === "transferir") {
        return NextResponse.json({ transferencia: await transferir(comercioId, { ...comun, ...items[0] }) });
      }
      return NextResponse.json({ resultados: await transferirVarios(comercioId, items, comun) });
    }
    return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
