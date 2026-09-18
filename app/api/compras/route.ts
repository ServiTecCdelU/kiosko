// app/api/compras/route.ts — recepcion de mercaderia via RPC recibir_compra_kiosko
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const compraSchema = z.object({
  proveedorId: z.string().min(1, "Falta el proveedor"),
  items: z
    .array(
      z.object({
        productoId: z.string().min(1),
        cantidad: z.number().positive("La cantidad debe ser mayor a cero"),
        costoUnitario: z.number().min(0, "El costo no puede ser negativo"),
      }),
    )
    .min(1, "La compra no tiene items"),
  remito: z.string().optional(),
  condicion: z.enum(["contado", "cuenta_corriente"]).default("contado"),
  pagada: z.boolean().default(true),
  notas: z.string().optional(),
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

  const parsed = compraSchema.safeParse(body);
  if (!parsed.success) {
    const detalle = parsed.error.issues[0]?.message ?? "Datos invalidos";
    return NextResponse.json({ error: detalle }, { status: 400 });
  }
  const input = parsed.data;

  const { data, error } = await supabaseAdmin.rpc("recibir_compra_kiosko", {
    p_comercio_id: comercioIdDeSesion(req),
    p_proveedor_id: input.proveedorId,
    p_items: input.items,
    p_remito: input.remito?.trim() || null,
    p_condicion: input.condicion,
    p_pagada: input.pagada,
    p_notas: input.notas?.trim() || null,
    p_usuario_id: input.usuarioId ?? null,
    p_usuario_nombre: input.usuarioNombre ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
