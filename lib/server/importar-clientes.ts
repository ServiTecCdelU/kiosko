// lib/server/importar-clientes.ts — alta masiva de clientes desde una planilla
// (server-only, service role). El parseo del archivo lo hace el navegador
// (lib/importar-filas.ts); aca van las escrituras, por comercio de la sesion.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generarIdLegible } from "@/lib/server/ids";

export interface ClienteImportacion {
  nombre: string;
  telefono: string;
  documento: string;
  limiteCredito: number;
  saldo: number;
  notas: string;
}

/** solo_nuevos: los que ya existen se saltean. actualizar: se les completa telefono, documento, limite y notas (la deuda no se toca). */
export type EstrategiaClientes = "solo_nuevos" | "actualizar";

export interface ResumenClientes {
  creados: number;
  actualizados: number;
  omitidos: number;
  /** Clientes nuevos que entraron con deuda inicial. */
  conDeuda: number;
}

interface Existente {
  id: string;
  telefono: string | null;
  documento: string | null;
  limite_credito: number;
  notas: string | null;
}

const COLUMNAS = "id, telefono, documento, limite_credito, notas";

/** `_` y `%` son comodines de ilike: se escapan para comparar el nombre exacto. */
function patronExacto(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Busca por documento, despues por telefono y por ultimo por nombre exacto (sin distinguir mayusculas). */
async function buscarExistente(f: ClienteImportacion, comercioId: string): Promise<Existente | null> {
  if (f.documento) {
    const { data } = await supabaseAdmin.from("clientes").select(COLUMNAS).eq("comercio_id", comercioId).eq("documento", f.documento).limit(1).maybeSingle();
    if (data) return data as Existente;
  }
  if (f.telefono) {
    const { data } = await supabaseAdmin.from("clientes").select(COLUMNAS).eq("comercio_id", comercioId).eq("telefono", f.telefono).limit(1).maybeSingle();
    if (data) return data as Existente;
  }
  const { data } = await supabaseAdmin.from("clientes").select(COLUMNAS).eq("comercio_id", comercioId).ilike("nombre", patronExacto(f.nombre)).limit(1).maybeSingle();
  return (data as Existente | null) ?? null;
}

async function importarCliente(f: ClienteImportacion, comercioId: string, estrategia: EstrategiaClientes, usuario: string, resumen: ResumenClientes): Promise<void> {
  const nombre = f.nombre.trim();
  if (!nombre) {
    resumen.omitidos++;
    return;
  }
  const existente = await buscarExistente(f, comercioId);

  if (existente) {
    if (estrategia === "solo_nuevos") {
      resumen.omitidos++;
      return;
    }
    const { error } = await supabaseAdmin
      .from("clientes")
      .update({
        telefono: f.telefono || existente.telefono,
        documento: f.documento || existente.documento,
        limite_credito: f.limiteCredito > 0 ? f.limiteCredito : existente.limite_credito,
        notas: f.notas || existente.notas,
        updated_at: new Date().toISOString(),
      })
      .eq("comercio_id", comercioId)
      .eq("id", existente.id);
    if (error) throw new Error(error.message);
    resumen.actualizados++;
    return;
  }

  const saldo = Math.max(0, Number(f.saldo) || 0);
  const id = await generarIdLegible("clientes", "cli", nombre);
  const { error } = await supabaseAdmin.from("clientes").insert({
    id,
    comercio_id: comercioId,
    nombre,
    telefono: f.telefono || null,
    documento: f.documento || null,
    limite_credito: Math.max(0, Number(f.limiteCredito) || 0),
    saldo,
    notas: f.notas || null,
    activo: true,
  });
  if (error) throw new Error(error.message);

  // La deuda inicial queda en la cuenta corriente como ajuste, asi el historial
  // del cliente explica de donde sale el saldo.
  if (saldo > 0) {
    const { error: errorMov } = await supabaseAdmin.from("cuenta_corriente_mov").insert({
      id: `ccm_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      comercio_id: comercioId,
      cliente_id: id,
      tipo: "ajuste",
      monto: saldo,
      saldo_anterior: 0,
      saldo_nuevo: saldo,
      referencia: "Deuda inicial (importación)",
      usuario,
    });
    if (errorMov) throw new Error(errorMov.message);
    resumen.conDeuda++;
  }
  resumen.creados++;
}

/** Procesa un lote de clientes. Secuencial: evita crear dos veces el mismo cliente repetido en el archivo. */
export async function importarLoteClientes(
  filas: ClienteImportacion[],
  comercioId: string,
  estrategia: EstrategiaClientes,
  usuario: string,
): Promise<ResumenClientes> {
  const resumen: ResumenClientes = { creados: 0, actualizados: 0, omitidos: 0, conDeuda: 0 };
  for (const f of filas) await importarCliente(f, comercioId, estrategia, usuario, resumen);
  return resumen;
}
