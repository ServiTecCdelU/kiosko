// lib/impresora/webusb.ts — manda bytes a una impresora USB desde el navegador (WebUSB).
//
// Chrome y Edge. El dueño elige la impresora una vez ("Conectar impresora USB") y el
// permiso queda guardado para esa PC. En Windows, si el driver de la impresora
// (usbprint.sys) la tiene tomada, Chrome no la puede reclamar: en ese caso va el agente.

// Tipos minimos de WebUSB (no estan en lib.dom de TypeScript).
interface UsbEndpoint { direction: "in" | "out"; endpointNumber: number; type: string }
interface UsbAlternate { interfaceClass: number; endpoints: UsbEndpoint[] }
interface UsbInterface { interfaceNumber: number; alternate: UsbAlternate; claimed: boolean }
interface UsbConfiguration { configurationValue: number; interfaces: UsbInterface[] }
export interface UsbDevice {
  productName?: string;
  manufacturerName?: string;
  vendorId: number;
  productId: number;
  opened: boolean;
  configuration: UsbConfiguration | null;
  configurations: UsbConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: string; bytesWritten: number }>;
}
interface UsbNavigator {
  requestDevice(opts: { filters: { classCode?: number; vendorId?: number }[] }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
}

const CLASE_IMPRESORA = 7;
const BLOQUE = 16 * 1024;

function usb(): UsbNavigator | null {
  if (typeof navigator === "undefined") return null;
  return ((navigator as unknown as { usb?: UsbNavigator }).usb) ?? null;
}

export function soportaWebUsb(): boolean {
  return usb() !== null;
}

export function nombreDispositivo(d: UsbDevice): string {
  const nombre = [d.manufacturerName, d.productName].filter(Boolean).join(" ").trim();
  return nombre || `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`;
}

/** Abre el selector del navegador. Devuelve null si el usuario cancelo. */
export async function elegirImpresoraUsb(): Promise<UsbDevice | null> {
  const n = usb();
  if (!n) throw new Error("Este navegador no tiene WebUSB. Usá Chrome o Edge, o el agente local.");
  try {
    // Primero impresoras (clase 7); si la impresora no se declara asi, cualquier USB.
    return await n.requestDevice({ filters: [{ classCode: CLASE_IMPRESORA }] }).catch(async (e) => {
      if (e instanceof DOMException && e.name === "NotFoundError") return n.requestDevice({ filters: [] });
      throw e;
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

/** La impresora que ya tiene permiso en esta PC, si hay. */
export async function impresoraUsbGuardada(): Promise<UsbDevice | null> {
  const n = usb();
  if (!n) return null;
  const dispositivos = await n.getDevices().catch(() => []);
  return dispositivos[0] ?? null;
}

function buscarSalida(d: UsbDevice): { interfaz: number; endpoint: number; configuracion: number } | null {
  for (const conf of d.configurations ?? (d.configuration ? [d.configuration] : [])) {
    // Preferimos la interfaz de clase impresora; si no hay, cualquiera con salida bulk.
    const candidatas = [...conf.interfaces].sort((a, b) =>
      Number(b.alternate.interfaceClass === CLASE_IMPRESORA) - Number(a.alternate.interfaceClass === CLASE_IMPRESORA));
    for (const i of candidatas) {
      const salida = i.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (salida) return { interfaz: i.interfaceNumber, endpoint: salida.endpointNumber, configuracion: conf.configurationValue };
    }
  }
  return null;
}

function explicarErrorUsb(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/claim|Unable to claim|Access denied|kernel/i.test(msg)) {
    return new Error(
      "Windows tiene tomada la impresora con su driver y el navegador no puede usarla. " +
      "Opciones: usar el modo 'agente local', o reemplazar el driver USB por WinUSB con Zadig.",
    );
  }
  if (/disconnected|not found|No device/i.test(msg)) return new Error("La impresora USB no está conectada.");
  return new Error(`No se pudo imprimir por USB: ${msg}`);
}

/** Manda los bytes a la impresora USB con permiso (o a la que se pasa). */
export async function enviarPorUsb(datos: Uint8Array, dispositivo?: UsbDevice | null): Promise<void> {
  const d = dispositivo ?? (await impresoraUsbGuardada());
  if (!d) throw new Error("No hay una impresora USB conectada. Configurala en “Impresora…”.");
  try {
    if (!d.opened) await d.open();
    const salida = buscarSalida(d);
    if (!salida) throw new Error("La impresora no tiene un canal de salida USB reconocible.");
    if (!d.configuration || d.configuration.configurationValue !== salida.configuracion) {
      await d.selectConfiguration(salida.configuracion);
    }
    const interfaz = d.configuration?.interfaces.find((i) => i.interfaceNumber === salida.interfaz);
    if (!interfaz?.claimed) await d.claimInterface(salida.interfaz);
    for (let i = 0; i < datos.length; i += BLOQUE) {
      const r = await d.transferOut(salida.endpoint, datos.slice(i, i + BLOQUE));
      if (r.status !== "ok") throw new Error(`la impresora respondió ${r.status}`);
    }
  } catch (e) {
    throw explicarErrorUsb(e);
  }
}
