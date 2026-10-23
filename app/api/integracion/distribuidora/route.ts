// app/api/integracion/distribuidora/route.ts — lo que llama el servidor de la
// distribuidora (su pantalla "Stock Super"). Sin sesion: Authorization Bearer con
// DISTRIBUIDORA_STOCK_CLAVE. El comercio NO viaja en el body: es el unico vinculado
// (distribuidora_vinculo), asi la distribuidora no puede tocar a ningun otro.
//   stock · transferir { productoId, cantidad, direccion, usuario? } · reintentar
import { NextResponse } from "next/server";
import { accesoDeComercio, mensajeSoloLectura } from "@/lib/server/acceso";
import { claveIntegracionValida, comercioVinculado, reintentarAbiertas, transferir, verStock } from "@/lib/server/distribuidora-stock";
import { cantidadTransferible, esDireccion } from "@/lib/stock-distribuidora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!claveIntegracionValida(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const comercioId = await comercioVinculado();
    if (!comercioId) return NextResponse.json({ error: "No hay ningún comercio vinculado" }, { status: 404 });

    if (body?.accion === "stock") return NextResponse.json(await verStock(comercioId));

    // Escribe: igual que en proxy.ts, un comercio en solo lectura no mueve stock.
    const acceso = await accesoDeComercio(comercioId);
    if (acceso.nivel === "solo_lectura") return NextResponse.json({ error: mensajeSoloLectura(acceso) }, { status: 403 });

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
        usuario: typeof body.usuario === "string" ? body.usuario.slice(0, 80) : null,
        pedidaEn: "distribuidora",
      });
      return NextResponse.json({ transferencia });
    }
    return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
