// lib/server/zpl.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generarZPL, partirEnLineas, anchoTexto, ANCHO_PUNTOS, MARGEN_INFERIOR } from "./zpl.ts";
import { comprimirFilas, filasDesdePixeles, recortarFilasBlancas } from "../zpl-logo.ts";
import { datosTicketValidos, formatearCuit } from "../ticket-negocio.ts";

const ticketBase = () => ({
  comercio: "Almacén Doña Ñata",
  encabezado: { direccion: "San Martín 123, Paraná", telefono: "343 456-7890", cuit: "20123456789" },
  saleNumber: "0001-00000042",
  createdAt: new Date(2026, 9, 10, 14, 5),
  items: [
    { name: "Coca Cola 500ml", quantity: 2, price: 1200, subtotal: 2400, unidad: "un" as const },
    { name: "Queso cremoso (fiambrería)", quantity: 0.35, price: 8000, subtotal: 2800, unidad: "kg" as const },
  ],
  total: 5200,
  paymentMethod: "efectivo" as const,
  cashAmount: 6000,
  changeAmount: 800,
  userName: "María",
});

function altoDeEtiqueta(zpl: string): number {
  return Number(/\^LL(\d+)/.exec(zpl)?.[1]);
}

/** Lo mas bajo que imprime algun campo (texto: y + alto de letra; lineas: y + grosor). */
function fondoImpreso(zpl: string): number {
  let max = 0;
  for (const m of zpl.matchAll(/\^FO\d+,(\d+)\^A0N,(\d+)/g)) max = Math.max(max, Number(m[1]) + Number(m[2]));
  for (const m of zpl.matchAll(/\^FO\d+,(\d+)\^GB\d+,(\d+)/g)) max = Math.max(max, Number(m[1]) + Number(m[2]));
  return max;
}

describe("generarZPL", () => {
  test("arranca con ^XA, termina con ^XZ y usa UTF-8", () => {
    const zpl = generarZPL(ticketBase());
    assert.ok(zpl.startsWith("^XA\n^CI28\n"));
    assert.ok(zpl.endsWith("^XZ"));
  });

  test("papel continuo, ancho fijo y sin desplazamientos", () => {
    const zpl = generarZPL(ticketBase());
    for (const cmd of ["^MNN", "^MTD", "^MMT", `^PW${ANCHO_PUNTOS}`, "^LH0,0", "^LT0"]) assert.ok(zpl.includes(cmd), cmd);
  });

  test("el alto es lo impreso mas 0,5 cm (40 puntos)", () => {
    const zpl = generarZPL(ticketBase());
    assert.equal(altoDeEtiqueta(zpl), fondoImpreso(zpl) + MARGEN_INFERIOR);
  });

  test("nombre y datos del negocio salen del ticket, no fijos", () => {
    const zpl = generarZPL(ticketBase());
    assert.ok(zpl.includes("^FDAlmacén Doña Ñata^FS"));
    assert.ok(zpl.includes("San Martín 123, Paraná"));
    assert.ok(zpl.includes("Tel: 343 456-7890"));
    assert.ok(zpl.includes("CUIT: 20-12345678-9"));
    assert.ok(!zpl.includes("Patricia"));
  });

  test("sin datos opcionales no imprime renglones vacios", () => {
    const zpl = generarZPL({ ...ticketBase(), encabezado: undefined, userName: undefined });
    assert.ok(!zpl.includes("Tel:"));
    assert.ok(!zpl.includes("CUIT:"));
    assert.ok(!zpl.includes("Cajero:"));
  });

  test("total, abonado, vuelto y pie", () => {
    const zpl = generarZPL(ticketBase());
    assert.ok(zpl.includes("^FDTOTAL^FS"));
    assert.ok(zpl.includes(",1,0,R^FD$5.200^FS"));
    assert.ok(zpl.includes("^FDAbonó^FS"));
    assert.ok(zpl.includes("^FD$6.000^FS"));
    assert.ok(zpl.includes("^FD$800^FS"));
    assert.ok(zpl.includes("¡Gracias por su compra!"));
    assert.ok(zpl.includes("Ticket no válido como factura"));
  });

  test("con oferta muestra el precio de lista y el descuento aparte", () => {
    const t = ticketBase();
    t.items = [{ name: "Gaseosa 2.25L", quantity: 2, price: 1500, subtotal: 3000, unidad: "un", ahorro: 1000 } as any];
    const zpl = generarZPL(t);
    assert.ok(zpl.includes("2 x $2.000"));
    assert.ok(zpl.includes("^FD$4.000^FS"));
    assert.ok(zpl.includes("^FD-$1.000^FS"));
  });

  test("^ y ~ del texto no rompen el formato", () => {
    const zpl = generarZPL({ ...ticketBase(), comercio: "Kiosco ^XZ ~JA" });
    assert.equal(zpl.match(/\^XZ/g)?.length, 1);
    assert.ok(!zpl.includes("~"));
  });

  test("el logo va arriba de todo, centrado", () => {
    const logo = { bytesPorFila: 10, alto: 40, datos: comprimirFilas(Array(40).fill("FF".repeat(10))), vista: "" };
    const zpl = generarZPL({ ...ticketBase(), encabezado: { logo } });
    const gf = zpl.indexOf("^GFA,400,400,10,");
    assert.ok(gf > 0 && gf < zpl.indexOf("Almacén"));
    assert.ok(zpl.includes(`^FO${12 + (360 - 80) / 2},16^GFA`));
  });
});

describe("partirEnLineas", () => {
  test("ningun renglon pasa del ancho util", () => {
    const largo = "GALLETITAS DULCES RELLENAS SABOR CHOCOLATE CON VAINILLA PAQUETE FAMILIAR X 3 UNIDADES";
    const lineas = partirEnLineas(largo, 24);
    assert.ok(lineas.length > 1);
    for (const l of lineas) assert.ok(anchoTexto(l, 24) <= 360, l);
    assert.equal(lineas.join(" "), largo);
  });

  test("una palabra sin espacios se corta a la fuerza", () => {
    const lineas = partirEnLineas("X".repeat(80), 24);
    assert.ok(lineas.length > 1);
    assert.equal(lineas.join(""), "X".repeat(80));
  });
});

describe("logo ZPL", () => {
  test("pixeles negros a bits, transparente es blanco", () => {
    // 8x1: negro, blanco, transparente, negro, ...
    const px = [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255];
    assert.deepEqual(filasDesdePixeles(px, 8, 1), ["9F"]);
  });

  test("compresion: corridas, ceros al final y fila repetida", () => {
    assert.equal(comprimirFilas(["FFFFFF00", "FFFFFF00", "00000000"]), "LF,:,");
    assert.equal(comprimirFilas(["F".repeat(40)]), "hF");
  });

  test("recorta filas blancas arriba y abajo", () => {
    assert.deepEqual(recortarFilasBlancas(["00", "0F", "00", "F0", "00"]), ["0F", "00", "F0"]);
    assert.deepEqual(recortarFilasBlancas(["00"]), []);
  });
});

describe("datos del ticket", () => {
  test("CUIT con guiones", () => {
    assert.equal(formatearCuit("20123456789"), "20-12345678-9");
    assert.equal(formatearCuit("20-12345678-9"), "20-12345678-9");
    assert.equal(formatearCuit("123"), "123");
  });

  test("descarta un logo con caracteres que romperian el ZPL", () => {
    const d = datosTicketValidos({ nombre: "  Kiosco  ", logo: { bytesPorFila: 4, alto: 10, datos: "FF^XZ", vista: "" } });
    assert.equal(d.nombre, "Kiosco");
    assert.equal(d.logo, null);
  });
});
