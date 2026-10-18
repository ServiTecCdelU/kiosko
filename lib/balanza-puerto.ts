// lib/balanza-puerto.ts — habla con la balanza por Web Serial (Chrome y Edge).
//
// Sirve con balanzas RS-232 (con adaptador USB-serie) y con las USB que Windows ve
// como puerto COM. El dueño elige el puerto una vez ("Conectar balanza") y el
// permiso queda guardado para esa PC. La trama la interpreta lib/balanza-serie.ts.

import { PROTOCOLOS, leerTrama, type LecturaPeso, type ProtocoloBalanza } from "./balanza-serie.ts";

// Tipos minimos de Web Serial (no estan en lib.dom de TypeScript).
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number }
interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(opts: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface SerialNavigator {
  requestPort(opts?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

function serial(): SerialNavigator | null {
  if (typeof navigator === "undefined") return null;
  return ((navigator as unknown as { serial?: SerialNavigator }).serial) ?? null;
}

export function soportaBalanzaSerie(): boolean {
  return serial() !== null;
}

export interface ConfigLectura {
  protocolo: ProtocoloBalanza;
  baudRate: number;
  /** Para numeros sin coma ni punto: 3 = gramos. */
  decimales: number;
}

// Un solo puerto abierto por pestaña, con un lector de fondo que junta lo que llega.
let puerto: SerialPortLike | null = null;
let abiertoA: number | null = null;
let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;
let buffer: number[] = [];
const MAX_BUFFER = 1024;

export function nombrePuerto(p: SerialPortLike | null = puerto): string {
  const i = p?.getInfo();
  if (!i?.usbVendorId) return "Puerto serie";
  return `USB ${i.usbVendorId.toString(16).padStart(4, "0")}:${(i.usbProductId ?? 0).toString(16).padStart(4, "0")}`;
}

/** Abre el selector del navegador. null si el usuario cancelo. */
export async function elegirPuertoBalanza(): Promise<SerialPortLike | null> {
  const s = serial();
  if (!s) throw new Error("Este navegador no puede leer balanzas. Usá Chrome o Edge.");
  try {
    const p = await s.requestPort();
    await cerrarBalanza();
    puerto = p;
    return p;
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

/** El puerto que ya tiene permiso en esta PC (sin preguntar). */
export async function puertoBalanzaGuardado(): Promise<SerialPortLike | null> {
  if (puerto) return puerto;
  const ports = await serial()?.getPorts().catch(() => []) ?? [];
  puerto = ports[0] ?? null;
  return puerto;
}

async function leerDeFondo(p: SerialPortLike): Promise<void> {
  while (p.readable && puerto === p) {
    lector = p.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        if (value) {
          buffer.push(...value);
          if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
        }
      }
    } catch {
      // Error de lectura (cable desconectado, ruido): se corta y se reabre al pedir.
      break;
    } finally {
      lector?.releaseLock();
      lector = null;
    }
  }
}

async function abrir(baudRate: number): Promise<SerialPortLike> {
  const p = await puertoBalanzaGuardado();
  if (!p) throw new Error("No hay balanza conectada en esta PC. Conectala en “Impresora y balanza”.");
  if (abiertoA === baudRate) return p;
  if (abiertoA !== null) await cerrarBalanza(false);
  try {
    await p.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none" });
  } catch (e) {
    // Ya abierto (otra pestaña o una lectura anterior): se usa igual.
    if (!(e instanceof DOMException && e.name === "InvalidStateError")) {
      throw new Error("No se pudo abrir el puerto de la balanza. ¿Está conectada? ¿La usa otro programa?");
    }
  }
  abiertoA = baudRate;
  puerto = p;
  void leerDeFondo(p);
  return p;
}

export async function cerrarBalanza(olvidar = true): Promise<void> {
  const p = puerto;
  abiertoA = null;
  if (olvidar) puerto = null;
  try { await lector?.cancel(); } catch { /* ya cerrado */ }
  try { await p?.close(); } catch { /* ya cerrado */ }
  buffer = [];
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bytes crudos de la ultima lectura (para la pantalla de prueba). */
export let ultimosBytes: number[] = [];

/**
 * Pide el peso y espera la respuesta (hasta `timeoutMs`). Con transmision continua
 * no manda nada: espera la proxima linea completa.
 */
export async function leerPesoBalanza(cfg: ConfigLectura, timeoutMs = 900): Promise<LecturaPeso> {
  const p = await abrir(cfg.baudRate);
  const pedido = PROTOCOLOS.find((x) => x.id === cfg.protocolo)?.pedido ?? null;
  buffer = [];
  if (pedido && p.writable) {
    const w = p.writable.getWriter();
    try { await w.write(new Uint8Array(pedido)); } finally { w.releaseLock(); }
  }
  const hasta = Date.now() + timeoutMs;
  let lectura: LecturaPeso = { tipo: "nada" };
  while (Date.now() < hasta) {
    await esperar(30);
    lectura = leerTrama(buffer, cfg.protocolo, cfg.decimales);
    if (lectura.tipo !== "nada") break;
  }
  ultimosBytes = buffer.slice(0, 64);
  return lectura;
}

/**
 * Prueba los protocolos en orden y devuelve el primero que contesta un peso (o
 * "inestable", que tambien es una respuesta valida). El manual de Systel lo pide asi:
 * cual responde depende del modelo y la fecha de fabricacion.
 */
export async function detectarProtocoloBalanza(
  orden: ProtocoloBalanza[],
  baudRate: number,
  decimales: number,
): Promise<{ protocolo: ProtocoloBalanza; lectura: LecturaPeso } | null> {
  for (const protocolo of orden) {
    const lectura = await leerPesoBalanza({ protocolo, baudRate, decimales }, protocolo === "continuo" ? 1500 : 700);
    if (lectura.tipo === "peso" || lectura.tipo === "inestable") return { protocolo, lectura };
  }
  return null;
}
