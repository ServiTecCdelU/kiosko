// app/api/compras/factura-afip/route.ts — interpreta el QR de una factura
// electronica del proveedor y dice que hacer con ella: a que proveedor del
// comercio corresponde (por CUIT), si ya fue cargada y si esta a nombre del
// comercio. No escribe nada: la compra se registra despues en /api/compras.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { leerConfigAfip } from "@/lib/server/afip/config";
import { formatearCuit, leerQrAfip } from "@/lib/afip/qr-comprobante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const lectura = leerQrAfip(String(body?.qr ?? ""));
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 });
  const c = lectura.comprobante;
  const comercioId = comercioIdDeSesion(req);

  const [proveedor, duplicada, config] = await Promise.all([
    supabaseAdmin.from("proveedores").select("id, nombre, activo").eq("comercio_id", comercioId).eq("cuit", c.cuit).limit(1).maybeSingle(),
    supabaseAdmin.from("compras").select("id, created_at, total").eq("comercio_id", comercioId).eq("estado", "recibida")
      .eq("comprobante_afip->>clave", c.clave).limit(1).maybeSingle(),
    leerConfigAfip(comercioId).catch(() => null),
  ]);
  if (proveedor.error) return NextResponse.json({ error: proveedor.error.message }, { status: 400 });
  if (duplicada.error) return NextResponse.json({ error: duplicada.error.message }, { status: 400 });

  const avisos: string[] = [];
  if (c.esNotaCredito) avisos.push(`Es una ${c.nombreTipo}: resta deuda, no se carga como compra.`);
  const cuitComercio = config?.cuit?.replace(/\D/g, "");
  if (cuitComercio && c.tipoDocRec === 80 && c.nroDocRec && c.nroDocRec !== cuitComercio) {
    avisos.push(`La factura está a nombre del CUIT ${formatearCuit(c.nroDocRec)}, no del tuyo (${formatearCuit(cuitComercio)}).`);
  }

  return NextResponse.json({
    comprobante: c,
    proveedor: proveedor.data ? { id: proveedor.data.id, nombre: proveedor.data.nombre, activo: !!proveedor.data.activo } : null,
    duplicada: duplicada.data ? { compraId: duplicada.data.id, fecha: duplicada.data.created_at, total: Number(duplicada.data.total) || 0 } : null,
    avisos,
  });
}
