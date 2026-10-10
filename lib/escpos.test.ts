// lib/escpos.test.ts — correr con: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generarTicketEscPos, comandoAbrirCajon, lineasTicket, formatearPesos, sinAcentos,
  partirLineas, lineaDosColumnas, centrar, columnasPorAncho,
  CMD_INIT, CMD_CORTE, CMD_ABRIR_CAJON, COLUMNAS_58MM, COLUMNAS_80MM,
} from "./escpos.ts";

const ticketBase = () => ({
  comercio: "Almacén Doña Ñata",
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

function contiene(bytes: Uint8Array, secuencia: number[]): boolean {
  outer: for (let i = 0; i + secuencia.length <= bytes.length; i++) {
    for (let j = 0; j < secuencia.length; j++) if (bytes[i + j] !== secuencia[j]) continue outer;
    return true;
  }
  return false;
}

function textoDe(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
}

describe("formatearPesos", () => {
  test("enteros con punto de miles y sin decimales", () => {
    assert.equal(formatearPesos(0), "$0");
    assert.equal(formatearPesos(999), "$999");
    assert.equal(formatearPesos(1200), "$1.200");
    assert.equal(formatearPesos(1234567), "$1.234.567");
  });
  test("decimales con coma solo cuando hay centavos", () => {
    assert.equal(formatearPesos(1200.5), "$1.200,50");
    assert.equal(formatearPesos(0.1 + 0.2), "$0,30");
    assert.equal(formatearPesos(1.999), "$2");
    assert.equal(formatearPesos(-350), "-$350");
  });
  test("NaN no rompe el ticket", () => {
    assert.equal(formatearPesos(Number.NaN), "$0");
  });
});

describe("sinAcentos", () => {
  test("saca acentos, enie y signos que no son ASCII", () => {
    assert.equal(sinAcentos("Almacén Doña Ñata ¡Gracias! ¿Qué?"), "Almacen Dona Nata Gracias! Que?");
    assert.equal(sinAcentos("★ Yerba 1kg — $2.000"), "* Yerba 1kg - $2.000");
    assert.equal(sinAcentos("emoji 🙂"), "emoji ??");
  });
});

describe("partirLineas y columnas", () => {
  test("corta por palabra y respeta el ancho", () => {
    const lineas = partirLineas("Fideos tallarín Matarazzo paquete de 500 gramos", 20);
    for (const l of lineas) assert.ok(l.length <= 20, `"${l}" se pasa de 20`);
    assert.deepEqual(lineas, ["Fideos tallarin", "Matarazzo paquete de", "500 gramos"]);
  });
  test("una palabra mas larga que la linea se corta a la fuerza", () => {
    assert.deepEqual(partirLineas("Supercalifragilistico", 8), ["Supercal", "ifragili", "stico"]);
  });
  test("lineaDosColumnas llena exactamente las columnas", () => {
    const l = lineaDosColumnas("TOTAL", "$5.200", 32);
    assert.equal(l.length, 32);
    assert.ok(l.startsWith("TOTAL"));
    assert.ok(l.endsWith("$5.200"));
  });
  test("lineaDosColumnas recorta la izquierda para que la derecha siempre entre", () => {
    const l = lineaDosColumnas("x".repeat(60), "$1.000", 32);
    assert.equal(l.length, 32);
    assert.ok(l.endsWith(" $1.000"));
  });
  test("centrar deja margen parejo", () => {
    assert.equal(centrar("abcd", 10), "   abcd");
  });
  test("columnas por ancho de papel", () => {
    assert.equal(columnasPorAncho(80), COLUMNAS_80MM);
    assert.equal(columnasPorAncho(58), COLUMNAS_58MM);
  });
});

describe("lineasTicket", () => {
  test("arma el ticket completo en 48 columnas", () => {
    const lineas = lineasTicket(ticketBase(), 48);
    for (const l of lineas) assert.ok(l.length <= 48, `"${l}" se pasa de 48`);
    assert.ok(lineas.includes(centrar("Almacen Dona Nata", 48)));
    assert.ok(lineas.includes(centrar("10/10/2026 14:05", 48)));
    assert.ok(lineas.includes(centrar("#0001-00000042", 48)));
    assert.ok(lineas.some((l) => l.includes("0.35kg x $8.000") && l.endsWith("$2.800")));
    assert.ok(lineas.some((l) => l.startsWith("TOTAL") && l.endsWith("$5.200")));
    assert.ok(lineas.includes("Pago: Efectivo"));
    assert.ok(lineas.includes("Vuelto: $800"));
    assert.ok(lineas.includes("Atendio: Maria"));
  });
  test("en 58 mm ningun renglon pasa las 32 columnas", () => {
    const t = { ...ticketBase(), ofertasDestacadas: ["Yerba Playadito 1kg 3x2 $12.000 solo hoy"] , ahorroOfertas: 350 };
    const lineas = lineasTicket(t, 32);
    for (const l of lineas) assert.ok(l.length <= 32, `"${l}" se pasa de 32`);
    assert.ok(lineas.includes(centrar("*** USTED AHORRO $350 ***", 32)));
    assert.ok(lineas.includes(centrar("HOY EN OFERTA", 32)));
  });
  test("credito muestra cuotas y recargo; fiado muestra quien paga", () => {
    const credito = lineasTicket({ ...ticketBase(), paymentMethod: "credito", cuotas: 3, recargoPct: 10, changeAmount: 0 }, 48);
    assert.ok(credito.includes("Pago: Credito"));
    assert.ok(credito.includes("Cuotas: 3"));
    assert.ok(credito.includes("Recargo: 10%"));
    const fiado = lineasTicket({ ...ticketBase(), paymentMethod: "fiado", pagadorNombre: "Los Fernández", changeAmount: 0 }, 48);
    assert.ok(fiado.includes("Pago: Fiado"));
    assert.ok(fiado.includes("Pago: Los Fernandez"));
    assert.ok(!fiado.some((l) => l.startsWith("Vuelto")));
  });
});

describe("generarTicketEscPos", () => {
  test("empieza con reset y termina con avance y corte", () => {
    const b = generarTicketEscPos(ticketBase());
    assert.deepEqual(Array.from(b.slice(0, 2)), CMD_INIT);
    assert.deepEqual(Array.from(b.slice(-4)), CMD_CORTE);
    assert.ok(contiene(b, [0x1b, 0x64, 4]), "avanza 4 lineas antes del corte");
  });
  test("todo el texto es ASCII imprimible o comandos", () => {
    const b = generarTicketEscPos({ ...ticketBase(), ofertasDestacadas: ["★ Café Ñandú 1kg"] });
    const texto = textoDe(b);
    assert.ok(texto.includes("Almacen Dona Nata"));
    assert.ok(texto.includes("* Cafe Nandu 1kg"));
    for (const byte of b) assert.ok(byte <= 0x7e, `byte fuera de ASCII: ${byte}`);
  });
  test("sin abrirCajon no manda el pulso; con abrirCajon lo manda antes del texto", () => {
    const sin = generarTicketEscPos(ticketBase());
    assert.ok(!contiene(sin, CMD_ABRIR_CAJON));
    const con = generarTicketEscPos(ticketBase(), { abrirCajon: true });
    assert.deepEqual(Array.from(con.slice(2, 2 + CMD_ABRIR_CAJON.length)), CMD_ABRIR_CAJON);
  });
  test("cortar: false no manda el comando de corte", () => {
    const b = generarTicketEscPos(ticketBase(), { cortar: false });
    assert.ok(!contiene(b, CMD_CORTE));
  });
  test("el total va en doble alto y negrita", () => {
    const b = generarTicketEscPos(ticketBase());
    const texto = textoDe(b);
    const i = texto.indexOf("TOTAL");
    assert.ok(i > 0);
    // Justo antes de TOTAL: ESC E 1 (negrita) y GS ! 1 (doble alto)
    assert.deepEqual(Array.from(b.slice(i - 6, i)), [0x1b, 0x45, 1, 0x1d, 0x21, 1]);
  });
  test("respeta las columnas de 58 mm", () => {
    const b = generarTicketEscPos(ticketBase(), { columnas: 32 });
    const texto = textoDe(b);
    assert.ok(texto.includes("-".repeat(32)));
    assert.ok(!texto.includes("-".repeat(33)));
  });
});

describe("comandoAbrirCajon", () => {
  test("reset mas pulso en los dos pines", () => {
    assert.deepEqual(Array.from(comandoAbrirCajon()), [...CMD_INIT, ...CMD_ABRIR_CAJON]);
  });
});
