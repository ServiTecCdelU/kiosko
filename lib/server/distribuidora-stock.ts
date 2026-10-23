// lib/server/distribuidora-stock.ts — orquesta las transferencias de stock entre el
// comercio vinculado y la distribuidora (spec 2026-10-23-stock-distribuidora-design.md).
//
// - Un solo comercio vinculado (tabla distribuidora_vinculo): cualquier otro no ve ni
//   mueve nada. Todo lo de aca filtra por ese comercio y por dist_id.
// - La distribuidora se llama con la clave DISTRIBUIDORA_STOCK_CLAVE (nunca llega al
//   navegador). Ella llama a /api/integracion/distribuidora con la misma clave.
// - Lado comercio: RPC aplicar_transferencia_comercio (migracion 77). Lado
//   distribuidora: su RPC mover_stock_kiosko. Las dos son idempotentes por id.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { leerTodo } from "@/lib/server/leer-todo";
import {
  deltaDistribuidora, estadoTrasPaso, ladoDelPaso, siguientePaso, transferenciaDesdeFila,
  type DireccionTransferencia, type FilaStock, type Transferencia,
} from "@/lib/stock-distribuidora";

/** La distribuidora contesto y no acepto el movimiento (ej. sin stock): no se movio nada alla. */
class RechazoDistribuidora extends Error {}

const SELECT_TRANSFERENCIA = "id, producto_id, dist_id, cantidad, direccion, estado, pedida_en, usuario, error, created_at, productos(name)";

/** Comercio vinculado a la distribuidora, o null si no hay ninguno. */
export async function comercioVinculado(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("distribuidora_vinculo").select("comercio_id").eq("activo", true).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.comercio_id ?? null;
}

export async function estaVinculado(comercioId: string): Promise<boolean> {
  return (await comercioVinculado()) === comercioId;
}

/** Authorization: Bearer <DISTRIBUIDORA_STOCK_CLAVE>, comparado en tiempo constante. */
export function claveIntegracionValida(req: Request): boolean {
  const clave = process.env.DISTRIBUIDORA_STOCK_CLAVE;
  if (!clave) return false;
  const recibida = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibida);
  const b = Buffer.from(clave);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function llamarDistribuidora<T>(body: Record<string, unknown>): Promise<T> {
  const base = process.env.DISTRIBUIDORA_API_URL;
  const clave = process.env.DISTRIBUIDORA_STOCK_CLAVE;
  if (!base || !clave) throw new Error("Falta configurar DISTRIBUIDORA_API_URL o DISTRIBUIDORA_STOCK_CLAVE");
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/api/integracion/kiosko`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("La distribuidora no responde");
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  const mensaje = data?.error ?? `La distribuidora respondio ${res.status}`;
  // 4xx: lo rechazo de verdad. 5xx: no se sabe si se aplico (se reintenta con el mismo id).
  if (res.status >= 400 && res.status < 500) throw new RechazoDistribuidora(mensaje);
  throw new Error(mensaje);
}

/** Stock de la distribuidora por id de producto (los que tiene). */
async function stockDistribuidora(): Promise<Map<string, number>> {
  const { stock } = await llamarDistribuidora<{ stock: Record<string, number> }>({ accion: "stock" });
  return new Map(Object.entries(stock ?? {}).map(([id, n]) => [id, Number(n) || 0]));
}

async function leerTransferencia(comercioId: string, id: string): Promise<Transferencia> {
  const { data, error } = await supabaseAdmin
    .from("transferencias_distribuidora")
    .select(SELECT_TRANSFERENCIA)
    .eq("id", id)
    .eq("comercio_id", comercioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La transferencia no existe");
  return transferenciaDesdeFila(data);
}

async function marcar(comercioId: string, id: string, cambios: Record<string, unknown>, estadoAnterior?: string) {
  let q = supabaseAdmin
    .from("transferencias_distribuidora")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("comercio_id", comercioId);
  // Que otro reintento en paralelo no la haga retroceder.
  if (estadoAnterior) q = q.eq("estado", estadoAnterior);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/**
 * Hace los pasos que le falten. Nunca lanza por un paso: el error queda guardado en
 * la transferencia (si quedo a medio camino se ve en la pantalla con "Reintentar").
 */
async function avanzar(comercioId: string, t: Transferencia): Promise<Transferencia> {
  for (let paso = siguientePaso(t.estado); paso; paso = siguientePaso(t.estado)) {
    const lado = ladoDelPaso(t.direccion, paso);
    try {
      if (lado === "comercio") {
        // La RPC descuenta o suma y avanza el estado en la misma transaccion.
        const { error } = await supabaseAdmin.rpc("aplicar_transferencia_comercio", {
          p_transferencia_id: t.id,
          p_comercio_id: comercioId,
        });
        if (error) {
          // En el origen es definitivo (ej. sin stock): la transaccion no movio nada.
          if (paso === "origen") await marcar(comercioId, t.id, { estado: "fallida", error: error.message }, "pendiente");
          else await marcar(comercioId, t.id, { error: error.message });
          break;
        }
      } else {
        await llamarDistribuidora({
          accion: "mover",
          transferenciaId: t.id,
          productoId: t.distId,
          delta: deltaDistribuidora(t.direccion, t.cantidad),
        });
        await marcar(comercioId, t.id, { estado: estadoTrasPaso(paso), error: null }, t.estado);
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      if (e instanceof RechazoDistribuidora && paso === "origen") {
        await marcar(comercioId, t.id, { estado: "fallida", error: mensaje }, "pendiente");
      } else {
        await marcar(comercioId, t.id, { error: mensaje }).catch(() => {});
      }
      break;
    } finally {
      t = await leerTransferencia(comercioId, t.id);
    }
  }
  return t;
}

export async function transferir(
  comercioId: string,
  datos: { productoId: string; cantidad: number; direccion: DireccionTransferencia; usuario: string | null; pedidaEn: "comercio" | "distribuidora" },
): Promise<Transferencia> {
  // El producto tiene que ser de este comercio y venir de la distribuidora.
  const { data: producto, error } = await supabaseAdmin
    .from("productos")
    .select("id, dist_id")
    .eq("id", datos.productoId)
    .eq("comercio_id", comercioId)
    .not("dist_id", "is", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!producto) throw new Error("Ese producto no es de la distribuidora");

  const id = `tdist_${randomUUID()}`;
  const { error: errorAlta } = await supabaseAdmin.from("transferencias_distribuidora").insert({
    id,
    comercio_id: comercioId,
    producto_id: producto.id,
    dist_id: producto.dist_id,
    cantidad: datos.cantidad,
    direccion: datos.direccion,
    pedida_en: datos.pedidaEn,
    usuario: datos.usuario,
  });
  if (errorAlta) throw new Error(errorAlta.message);
  return avanzar(comercioId, await leerTransferencia(comercioId, id));
}

/** Reintenta las que quedaron a medio camino. */
export async function reintentarAbiertas(comercioId: string): Promise<Transferencia[]> {
  const { data, error } = await supabaseAdmin
    .from("transferencias_distribuidora")
    .select(SELECT_TRANSFERENCIA)
    .eq("comercio_id", comercioId)
    .in("estado", ["pendiente", "origen_ok"])
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  const resultado: Transferencia[] = [];
  for (const fila of data ?? []) resultado.push(await avanzar(comercioId, transferenciaDesdeFila(fila)));
  return resultado;
}

/** Productos de la distribuidora con el stock de los dos lados, y las ultimas transferencias. */
export async function verStock(comercioId: string): Promise<{ productos: FilaStock[]; transferencias: Transferencia[]; errorDistribuidora?: string }> {
  const [locales, remoto, transferencias] = await Promise.all([
    leerTodo<{ id: string; dist_id: string; name: string; codigo: string | null; stock: number }>((desde, hasta) =>
      supabaseAdmin
        .from("productos")
        .select("id, dist_id, name, codigo, stock")
        .eq("comercio_id", comercioId)
        .not("dist_id", "is", null)
        .eq("disabled", false)
        .order("name", { ascending: true })
        .range(desde, hasta),
    ),
    stockDistribuidora().then(
      (m) => ({ m, error: undefined as string | undefined }),
      (e) => ({ m: null, error: e instanceof Error ? e.message : String(e) }),
    ),
    supabaseAdmin
      .from("transferencias_distribuidora")
      .select(SELECT_TRANSFERENCIA)
      .eq("comercio_id", comercioId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (transferencias.error) throw new Error(transferencias.error.message);

  return {
    productos: locales.map((p) => ({
      productoId: p.id,
      distId: p.dist_id,
      nombre: p.name,
      codigo: p.codigo,
      stockComercio: Number(p.stock) || 0,
      stockDistribuidora: remoto.m ? remoto.m.get(p.dist_id) ?? null : null,
    })),
    transferencias: (transferencias.data ?? []).map(transferenciaDesdeFila),
    errorDistribuidora: remoto.error,
  };
}
