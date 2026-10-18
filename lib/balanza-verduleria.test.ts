// lib/balanza-verduleria.test.ts — correr con: npm test
// Verduleria con una Systel Cuora simulada: el cliente pesa varias verduras y la
// balanza imprime los codigos como dice su manual (etiqueta por producto
// `20 PLU IMPORTE X` y ticket de varios `22 AA IMPORTE-TOTAL X`). El POS los lee
// con lib/barcode-balanza.ts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCodigoBalanza, parseTicketBalanza, pesoDesdeImporte } from "./barcode-balanza.ts";
import { generarQendra } from "./qendra.ts";
import { precioFinal, precioLinea } from "./pricing.ts";

function digitoEAN13(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += (doce.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}
const ean = (doce: string) => doce + digitoEAN13(doce);

// Catalogo de la verduleria (el mismo en la Cuora, cargado por Qendra, y en el sistema).
const CATALOGO = [
  { plu: 7001, nombre: "Tomate", precioKg: 2400 },
  { plu: 7002, nombre: "Papa", precioKg: 950 },
  { plu: 7003, nombre: "Cebolla", precioKg: 1180 },
  { plu: 7008, nombre: "Banana", precioKg: 2190 },
];

// Lo que pesa el cliente en la balanza.
const COMPRA = [
  { plu: 7001, kg: 0.735 },
  { plu: 7002, kg: 2.104 },
  { plu: 7003, kg: 0.512 },
  { plu: 7008, kg: 1.268 },
];

/**
 * La Cuora: importe = precio x peso redondeado al centavo. Etiqueta 4+6 con importe
 * en centavos (fabrica) o 5+5 con el peso en gramos: con 5 digitos de importe en
 * centavos no entra nada de mas de $999,99.
 */
function cuora(digitosPlu: 4 | 5) {
  const lineas = COMPRA.map((c) => {
    const p = CATALOGO.find((x) => x.plu === c.plu)!;
    const centavos = Math.round(p.precioKg * c.kg * 100);
    const valor = digitosPlu === 4 ? centavos : Math.round(c.kg * 1000);
    const etiqueta = ean(`20${String(c.plu).padStart(digitosPlu, "0")}${String(valor).padStart(10 - digitosPlu, "0")}`);
    return { ...c, centavos, etiqueta };
  });
  const totalCentavos = lineas.reduce((s, l) => s + l.centavos, 0);
  const ticket = ean(`2201${String(totalCentavos).padStart(8, "0")}`);
  return { lineas, totalCentavos, ticket };
}

describe("verduleria con Systel Cuora", () => {
  for (const [digitos, formato] of [[4, "importe-centavos"], [5, "peso"]] as const) {
    test(`una etiqueta por verdura (${digitos} digitos, ${formato}): el POS toma cada producto, kg e importe`, () => {
      const { lineas, totalCentavos } = cuora(digitos);
      let cobradoCentavos = 0;
      for (const l of lineas) {
        assert.equal(l.etiqueta.length, 13);
        const leida = parseCodigoBalanza(l.etiqueta, formato, digitos);
        assert.ok(leida, `no se leyo ${l.etiqueta}`);
        const producto = CATALOGO.find((p) => leida.codigosBusqueda.includes(String(p.plu)));
        assert.ok(producto, `PLU ${leida.plu} sin producto`);
        // El POS saca el peso del importe con el precio del sistema...
        const kg = leida.importe !== null ? pesoDesdeImporte(leida.importe, producto.precioKg)! : leida.pesoKg!;
        assert.equal(kg, l.kg, `${producto.nombre}: peso`);
        // ...y el servidor cobra precio x peso: da lo mismo que la etiqueta.
        cobradoCentavos += Math.round(producto.precioKg * kg * 100);
      }
      assert.equal(cobradoCentavos, totalCentavos);
    });
  }

  test("el ticket de varios trae solo el total (sin detalle de verduras)", () => {
    const { ticket, totalCentavos } = cuora(4);
    assert.deepEqual(parseTicketBalanza(ticket, "22", true), { importe: totalCentavos / 100 });
    // Sin el ticket activado, el 22 no se toma como ticket.
    assert.equal(parseTicketBalanza(ticket, null, true), null);
    // Una etiqueta de producto (20) no es un ticket.
    assert.equal(parseTicketBalanza(cuora(4).lineas[0].etiqueta, "22", true), null);
  });

  test("oferta: Qendra manda el precio con -20% y la caja cobra lo mismo que la etiqueta", () => {
    const tomate = { name: "Tomate", codigo: "7001", price: 2400, unidad: "kg", ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 20 };
    // Qendra: precio por kg que recibe la balanza.
    const precioBalanza = Number(generarQendra([tomate]).lineas[0].split(";")[4].replace(",", "."));
    assert.equal(precioBalanza, 1920);
    // La Cuora pesa 0,735 kg e imprime el importe con ese precio.
    const centavos = Math.round(precioBalanza * 0.735 * 100);
    const etiqueta = ean(`207001${String(centavos).padStart(6, "0")}`);
    // POS: peso con el precio de oferta, y el servidor cobra la linea con la oferta.
    const leida = parseCodigoBalanza(etiqueta, "importe-centavos", 4)!;
    const kg = pesoDesdeImporte(leida.importe!, precioFinal(tomate))!;
    assert.equal(kg, 0.735);
    assert.equal(precioLinea(tomate, kg), leida.importe);
  });

  test("un importe en centavos leido como pesos enteros cobraria 100 veces mas", () => {
    const { lineas } = cuora(4);
    const bien = parseCodigoBalanza(lineas[0].etiqueta, "importe-centavos", 4)!;
    const mal = parseCodigoBalanza(lineas[0].etiqueta, "importe", 4)!;
    assert.equal(mal.importe, bien.importe! * 100);
  });
});
