// app/api/ventas/devolver/route.ts — devolucion parcial de una venta via RPC
// registrar_devolucion_kiosko. A diferencia de anular, funciona aunque la caja
// de la venta original ya este cerrada (spec: devoluciones-post-cierre-design.md).
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const devolucionSchema = z.object({
  ventaId: z.string().min(1, "Falta la venta"),
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        cantidad: z.number().positive("La cantidad debe ser mayor a cero"),
      }),
    )
    .min(1, "La devolucion no tiene items"),
  motivo: z.string().optional(),
  reembolso: z.enum(["efectivo", "ninguno"]).default("ninguno"),
  usuarioId: z.string().optional(),
  usuarioNombre: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = devolucionSchema.safeParse(body);
  if (!parsed.success) {
    const detalle = parsed.error.issues[0]?.message ?? "Datos invalidos";
    return NextResponse.json({ error: detalle }, { status: 400 });
  }
  const input = parsed.data;
  const comercioId = comercioIdDeSesion(req);

  // El caja_id del reembolso en efectivo NUNCA sale del cliente: se resuelve
  // server-side como "la caja abierta de este usuario hoy", igual criterio
  // que comercioId. Evita que se le impute un gasto a la caja de otro cajero.
  let cajaId: string | null = null;
  if (input.reembolso === "efectivo") {
    if (!input.usuarioId) {
      return NextResponse.json({ error: "Falta identificar al usuario para el reembolso" }, { status: 400 });
    }
    const { data: caja, error: errorCaja } = await supabaseAdmin
      .from("caja")
      .select("id")
      .eq("comercio_id", comercioId)
      .eq("estado", "abierta")
      .eq("abierta_por", input.usuarioId)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errorCaja) return NextResponse.json({ error: errorCaja.message }, { status: 400 });
    if (!caja) {
      return NextResponse.json(
        { error: "No tenés una caja abierta hoy para reembolsar en efectivo" },
        { status: 409 },
      );
    }
    cajaId = caja.id;
  }

  const { data, error } = await supabaseAdmin.rpc("registrar_devolucion_kiosko", {
    p_comercio_id: comercioId,
    p_venta_id: input.ventaId,
    p_items: input.items,
    p_motivo: input.motivo?.trim() || null,
    p_reembolso: input.reembolso,
    p_caja_id: cajaId,
    p_usuario_id: input.usuarioId ?? null,
    p_usuario_nombre: input.usuarioNombre ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ devolucionId: data.devolucionId, total: Number(data.total) || 0 });
}
