// tests/db/harness.ts — utilidades para los tests contra una base REAL.
//
// Apuntan a un proyecto Supabase de PRUEBA, nunca al de produccion. Si no esta
// configurado, los tests se saltan solos (no fallan): asi `npm test` sigue
// verde para cualquiera que no tenga la base de prueba armada.
//
// Configuracion: crear .env.test.local en la raiz con
//   TEST_SUPABASE_URL=https://xxxx.supabase.co
//   TEST_SUPABASE_SERVICE_KEY=sb_secret_...
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function leerEnvTest(): Record<string, string> {
  const archivo = path.join(process.cwd(), ".env.test.local");
  if (!fs.existsSync(archivo)) return {};
  const out: Record<string, string> = {};
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    if (!linea || linea.trim().startsWith("#")) continue;
    const i = linea.indexOf("=");
    if (i < 1) continue;
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

const env = { ...leerEnvTest(), ...process.env } as Record<string, string>;
const url = env.TEST_SUPABASE_URL;
const key = env.TEST_SUPABASE_SERVICE_KEY;

export const hayBaseDePrueba = Boolean(url && key);

export const motivoSkip =
  "Falta la base de prueba: crear .env.test.local con TEST_SUPABASE_URL y TEST_SUPABASE_SERVICE_KEY (ver CLAUDE.md)";

/**
 * Guarda de seguridad: si la URL de prueba coincide con la de produccion,
 * se aborta. Un test que borre datos contra produccion seria un desastre.
 */
function verificarQueNoEsProduccion(): void {
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (prodUrl && url && prodUrl === url) {
    throw new Error(
      "TEST_SUPABASE_URL apunta al MISMO proyecto que produccion. Abortando: " +
        "los tests borran datos. Usar un proyecto Supabase aparte.",
    );
  }
}

let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (_db) return _db;
  verificarQueNoEsProduccion();
  _db = createClient(url!, key!, { auth: { persistSession: false } });
  return _db;
}

/** Sufijo unico por corrida, para que dos ejecuciones no se pisen. */
export const marca = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export interface Escenario {
  comercioId: string;
  cajaId: string;
  productoId: string;
  clienteId: string;
  limpiar: () => Promise<void>;
}

export interface OpcionesEscenario {
  stock?: number;
  precio?: number;
  stockControlado?: boolean;
  limiteCredito?: number;
  saldoCliente?: number;
  cajaAbierta?: boolean;
}

/** Crea un comercio aislado con una caja, un producto y un cliente. */
export async function crearEscenario(nombre: string, op: OpcionesEscenario = {}): Promise<Escenario> {
  const c = db();
  const id = `${marca}_${nombre}`;
  const comercioId = `com_${id}`;
  const cajaId = `caja_${id}`;
  const productoId = `prod_${id}`;
  const clienteId = `cli_${id}`;

  await c.from("comercios").insert({
    id: comercioId,
    nombre: `Test ${nombre}`,
    slug: comercioId,
    estado: "activo",
    plan: "free",
  });

  await c.from("caja").insert({
    id: cajaId,
    comercio_id: comercioId,
    estado: op.cajaAbierta === false ? "cerrada" : "abierta",
    monto_apertura: 0,
    opened_at: new Date().toISOString(),
  });

  await c.from("productos").insert({
    id: productoId,
    comercio_id: comercioId,
    name: `Producto ${nombre}`,
    price: op.precio ?? 100,
    stock: op.stock ?? 10,
    stock_minimo: 0,
    stock_controlado: op.stockControlado ?? true,
    disabled: false,
  });

  await c.from("clientes").insert({
    id: clienteId,
    comercio_id: comercioId,
    nombre: `Cliente ${nombre}`,
    limite_credito: op.limiteCredito ?? 0,
    saldo: op.saldoCliente ?? 0,
    activo: true,
  });

  const limpiar = async () => {
    // En orden inverso a las dependencias.
    await c.from("cuenta_corriente_mov").delete().eq("comercio_id", comercioId);
    await c.from("stock_movimientos").delete().eq("comercio_id", comercioId);
    await c.from("caja_movimientos").delete().eq("comercio_id", comercioId);
    await c.from("ventas").delete().eq("comercio_id", comercioId);
    await c.from("clientes").delete().eq("comercio_id", comercioId);
    await c.from("productos").delete().eq("comercio_id", comercioId);
    await c.from("caja").delete().eq("comercio_id", comercioId);
    await c.from("comercios").delete().eq("id", comercioId);
  };

  return { comercioId, cajaId, productoId, clienteId, limpiar };
}

/** Llama a process_sale_kiosko con valores por defecto razonables. */
export async function vender(
  e: Escenario,
  opciones: {
    cantidad?: number;
    total?: number;
    metodo?: string;
    clienteId?: string | null;
    cajaId?: string | null;
    precio?: number;
  } = {},
) {
  const cantidad = opciones.cantidad ?? 1;
  const precio = opciones.precio ?? 100;
  return db().rpc("process_sale_kiosko", {
    p_items: [
      {
        productId: e.productoId,
        name: "Producto",
        quantity: cantidad,
        price: precio,
        subtotal: precio * cantidad,
      },
    ],
    p_total: opciones.total ?? precio * cantidad,
    p_payment_method: opciones.metodo ?? "efectivo",
    p_cash_amount: 0,
    p_change_amount: 0,
    p_transfer_amount: 0,
    p_discount: 0,
    p_caja_id: opciones.cajaId === undefined ? e.cajaId : opciones.cajaId,
    p_user_id: null,
    p_user_name: "Test",
    p_cliente_id: opciones.clienteId ?? null,
    p_comercio_id: e.comercioId,
  });
}

export async function stockDe(productoId: string): Promise<number> {
  const { data } = await db().from("productos").select("stock").eq("id", productoId).single();
  return Number(data?.stock);
}

export async function saldoDe(clienteId: string): Promise<number> {
  const { data } = await db().from("clientes").select("saldo").eq("id", clienteId).single();
  return Number(data?.saldo);
}
