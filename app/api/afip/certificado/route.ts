// app/api/afip/certificado/route.ts — el admin sube el certificado (.crt) que le
// dio AFIP para el pedido generado aca (solo admin, proxy.ts). Se valida que
// corresponda a la clave guardada y a la CUIT antes de guardarlo.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { estadoPublico, subirCertificado } from "@/lib/server/afip/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CERT = 20_000; // un .crt pesa ~2 KB

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  if (await esComercioDemo(comercioId)) {
    return NextResponse.json({ error: "La facturación electrónica está disponible en la versión paga." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const pem = String(body?.certificado ?? "");
  if (!pem.includes("BEGIN CERTIFICATE") || pem.length > MAX_CERT) {
    return NextResponse.json(
      { error: "Subí el archivo .crt que te dio AFIP (empieza con -----BEGIN CERTIFICATE-----)" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(estadoPublico(await subirCertificado(comercioId, pem)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar el certificado" }, { status: 400 });
  }
}
