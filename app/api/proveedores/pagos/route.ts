// app/api/proveedores/pagos/route.ts — pagos a proveedores (cuenta corriente).
// POST registra un pago (RPC registrar_pago_proveedor), DELETE lo anula.
// Solo admin: /api/proveedores esta en RUTAS_ADMIN (lib/permisos-api.ts).
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pagoSchema = z.object({
  proveedorId: z.string().min(1, "Falta el proveedor"),
  monto: z.number().positive("El monto debe ser mayor a cero"),
  metodo: z.enum(["efectivo", "transferencia", "otro"]),
  compraId: z.string().optional().nullable(),
  cajaId: z.string().optional().nullable(),
  nota: z.string().max(300).optional().nullable(),
  usuarioId: z.string().optional().nullable(),
  usuarioNombre: z.string().optional().nullable(),
});

async function leerJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 400 });
  }
  const i = parsed.data;
  const { data, error } = await supabaseAdmin.rpc("registrar_pago_proveedor", {
    p_comercio_id: comercioIdDeSesion(req),
    p_proveedor_id: i.proveedorId,
    p_monto: i.monto,
    p_metodo: i.metodo,
    p_compra_id: i.compraId || null,
    p_caja_id: i.metodo === "efectivo" ? i.cajaId || null : null,
    p_nota: i.nota?.trim() || null,
    p_usuario_id: i.usuarioId ?? null,
    p_usuario_nombre: i.usuarioNombre ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const body = (await leerJson(req)) as { pagoId?: unknown; usuarioId?: unknown } | null;
  const pagoId = String(body?.pagoId ?? "");
  if (!pagoId) return NextResponse.json({ error: "Falta el pago" }, { status: 400 });
  const { data, error } = await supabaseAdmin.rpc("anular_pago_proveedor", {
    p_pago_id: pagoId,
    p_comercio_id: comercioIdDeSesion(req),
    p_usuario_id: body?.usuarioId ? String(body.usuarioId) : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
