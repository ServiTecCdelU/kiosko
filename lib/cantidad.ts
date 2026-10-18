// lib/cantidad.ts — como se muestra una cantidad vendida (carrito, ticket, pantalla).
// Puro: lo usan el navegador, las impresoras (escpos, zpl) y los tests.
//
// El peso va siempre con 3 decimales y coma: las balanzas pesan al gramo, y con
// 2 decimales 0,355 kg salia "0.36kg" en el ticket y la cuenta no cerraba.

const kgFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** "0,355kg" para productos por peso; "3" para productos por unidad. */
export function cantidadTexto(cantidad: number, unidad: "un" | "kg" | undefined): string {
  if (unidad === "kg") return `${kgFormatter.format(cantidad)}kg`;
  return String(cantidad);
}
