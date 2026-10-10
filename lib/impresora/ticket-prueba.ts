// lib/impresora/ticket-prueba.ts — ticket fijo para probar la impresora
// (boton "Imprimir ticket de prueba" y la ruta /api/imprimir-ticket/prueba).
import type { TicketData } from "@/components/pos/ticket-print";

export function ticketDePrueba(comercio?: string): TicketData {
  return {
    comercio: comercio?.trim() || "Ticket de prueba",
    saleNumber: "0000-PRUEBA",
    createdAt: new Date(),
    items: [
      { name: "Coca Cola 500ml", quantity: 2, price: 1200, subtotal: 2400, unidad: "un" },
      { name: "Fideos Matarazzo 500g", quantity: 1, price: 900, subtotal: 900, unidad: "un" },
      { name: "Queso cremoso (fiambrería)", quantity: 0.35, price: 8000, subtotal: 2800, unidad: "kg" },
      { name: "Pan lactal", quantity: 1, price: 2100, subtotal: 2100, unidad: "un" },
      { name: "Yerba Playadito 1kg", quantity: 1, price: 4300, subtotal: 4300, unidad: "un" },
    ],
    total: 12500,
    ahorroOfertas: 600,
    ofertasDestacadas: ["Gaseosa 2.25L 2x1 $3.000"],
    paymentMethod: "efectivo",
    cashAmount: 15000,
    changeAmount: 2500,
    userName: "Cajero de prueba",
  };
}
