// app/api/afip/pedido/route.ts — pedido de certificado (solo admin, proxy.ts).
// POST genera clave privada (queda cifrada aca) + CSR. GET descarga el .csr
// para subirlo en AFIP/ARCA. El CSR es publico; la clave nunca sale.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { estadoPublico, generarPedido, leerConfigAfip } from "@/lib/server/afip/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  if (await esComercioDemo(comercioId)) {
    return NextResponse.json({ error: "La facturación electrónica está disponible en la versión paga." }, { status: 403 });
  }
  try {
    const { data } = await supabaseAdmin.from("comercios").select("slug").eq("id", comercioId).single();
    return NextResponse.json(estadoPublico(await generarPedido(comercioId, data?.slug ?? comercioId)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el pedido" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const fila = await leerConfigAfip(comercioIdDeSesion(req));
  if (!fila?.csr_pem) return NextResponse.json({ error: "Todavía no generaste el pedido" }, { status: 404 });
  return new Response(fila.csr_pem, {
    headers: {
      "Content-Type": "application/pkcs10",
      "Content-Disposition": `attachment; filename="pedido-certificado-${fila.cuit}.csr"`,
      "Cache-Control": "no-store",
    },
  });
}
