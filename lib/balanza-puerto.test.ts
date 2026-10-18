// lib/balanza-puerto.test.ts — correr con: npm test
// Balanza simulada: un puerto Web Serial falso que contesta como dice el manual de
// Systel (protocolo A) o como una Kretz en continuo. Prueba el pedido, la espera,
// la deteccion del protocolo y los reintentos sin hardware.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Responder = (pedido: number[]) => number[] | null;

class PuertoFalso {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  baud: number | null = null;
  private emitir: ((b: number[]) => void) | null = null;
  private responder: Responder;
  private continuo: number[] | null;
  constructor(responder: Responder, continuo: number[] | null = null) {
    this.responder = responder;
    this.continuo = continuo;
  }
  async open(opts: { baudRate: number }) {
    this.baud = opts.baudRate;
    this.readable = new ReadableStream<Uint8Array>({
      start: (ctrl) => {
        this.emitir = (b) => ctrl.enqueue(new Uint8Array(b));
        if (this.continuo) {
          const t = setInterval(() => this.emitir?.(this.continuo!), 50);
          t.unref?.();
        }
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        // Solo contesta a 9600, como una Systel de fabrica.
        const r = this.baud === 9600 ? this.responder([...chunk]) : null;
        if (r) setTimeout(() => this.emitir?.(r), 10);
      },
    });
  }
  async close() { this.readable = null; this.writable = null; }
  getInfo() { return { usbVendorId: 0x1a86, usbProductId: 0x7523 }; }
}

function instalar(p: PuertoFalso) {
  // Node 21+ trae un navigator global de solo lectura: se reemplaza con defineProperty.
  Object.defineProperty(globalThis, "navigator", {
    value: { serial: { getPorts: async () => [p], requestPort: async () => p } },
    configurable: true,
  });
}

const systelA = (gramos: () => string): Responder => (pedido) => {
  if (pedido.length !== 1 || pedido[0] !== 0x05) return null;
  const datos = [0x02, ...[...gramos()].map((c) => c.charCodeAt(0)), 0x03];
  return [...datos, datos.reduce((a, b) => a ^ b, 0)];
};

describe("balanza simulada", async () => {
  const mod = await import("./balanza-puerto.ts");
  beforeEach(async () => { await mod.cerrarBalanza(); });

  test("Systel A: pide $05 y lee 710 g", async () => {
    instalar(new PuertoFalso(systelA(() => "000710")));
    const l = await mod.leerPesoBalanza({ protocolo: "systel-a", baudRate: 9600, decimales: 3 });
    assert.deepEqual(l, { tipo: "peso", kg: 0.71, estable: true });
  });

  test("detecta el protocolo probando en orden (B y Torrey no contestan)", async () => {
    instalar(new PuertoFalso(systelA(() => "001250")));
    const r = await mod.detectarProtocoloBalanza(["systel-b", "torrey", "systel-a"], 9600, 3);
    assert.equal(r?.protocolo, "systel-a");
    assert.deepEqual(r?.lectura, { tipo: "peso", kg: 1.25, estable: true });
  });

  test("a otra velocidad no contesta: null", async () => {
    instalar(new PuertoFalso(systelA(() => "000710")));
    const r = await mod.detectarProtocoloBalanza(["systel-a"], 4800, 3);
    assert.equal(r, null);
  });

  test("inestable ($11) y despues estable", async () => {
    let n = 0;
    instalar(new PuertoFalso((p) => (p[0] === 0x05 ? (n++ === 0 ? [0x11] : systelA(() => "000355")(p)) : null)));
    const cfg = { protocolo: "systel-a" as const, baudRate: 9600, decimales: 3 };
    assert.deepEqual(await mod.leerPesoBalanza(cfg), { tipo: "inestable" });
    assert.deepEqual(await mod.leerPesoBalanza(cfg), { tipo: "peso", kg: 0.355, estable: true });
  });

  test("Kretz en continuo: lee la ultima linea completa", async () => {
    instalar(new PuertoFalso(() => null, [..."  0.520kg\r\n"].map((c) => c.charCodeAt(0))));
    const l = await mod.leerPesoBalanza({ protocolo: "continuo", baudRate: 9600, decimales: 3 });
    assert.deepEqual(l, { tipo: "peso", kg: 0.52, estable: true });
  });
});
