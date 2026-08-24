// components/pos/ticket-print.tsx — ticket termico 80mm, no fiscal
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type { PaymentMethod } from "@/lib/types";

export interface TicketData {
  saleNumber: string;
  createdAt: Date;
  items: { name: string; quantity: number; price: number; subtotal: number; unidad: "un" | "kg" }[];
  total: number;
  paymentMethod: PaymentMethod;
  cashAmount: number;
  changeAmount: number;
  userName?: string;
  pagadorNombre?: string;
  cuotas?: number;
  recargoPct?: number;
}

const METODO_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mixto: "Mixto (efectivo + transferencia)",
  fiado: "Fiado",
  mercadopago: "Mercado Pago (QR)",
  tarjeta: "Tarjeta (posnet)",
  mercadopago_point: "Mercado Pago (Point)",
  debito: "Débito",
  credito: "Crédito",
};

export function TicketPrint({ ticket }: { ticket: TicketData | null }) {
  if (!ticket) return null;

  return (
    <div id="ticket-print" className="bg-white p-2 font-mono text-[11px] leading-tight text-black">
      <p className="text-center text-sm font-bold">Demo</p>
      <p className="text-center">Ticket no fiscal</p>
      <p className="text-center">{formatDateTime(ticket.createdAt)}</p>
      <p className="text-center">#{ticket.saleNumber}</p>
      <div className="my-1 border-t border-dashed border-black" />
      {ticket.items.map((it, i) => (
        <div key={i} className="mb-0.5">
          <p className="line-clamp-2">{it.name}</p>
          <div className="flex justify-between">
            <span>
              {it.unidad === "kg" ? `${it.quantity.toFixed(2)}kg` : it.quantity} x {formatCurrency(it.price)}
            </span>
            <span>{formatCurrency(it.subtotal)}</span>
          </div>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(ticket.total)}</span>
      </div>
      <p>Pago: {METODO_LABEL[ticket.paymentMethod]}</p>
      {ticket.paymentMethod === "efectivo" && ticket.changeAmount > 0 && (
        <p>Vuelto: {formatCurrency(ticket.changeAmount)}</p>
      )}
      {ticket.paymentMethod === "credito" && !!ticket.cuotas && <p>Cuotas: {ticket.cuotas}</p>}
      {ticket.paymentMethod === "credito" && !!ticket.recargoPct && (
        <p>Recargo: {ticket.recargoPct}%</p>
      )}
      {ticket.pagadorNombre && <p>Pagó: {ticket.pagadorNombre}</p>}
      {ticket.userName && <p>Atendió: {ticket.userName}</p>}
      <div className="my-1 border-t border-dashed border-black" />
      <p className="text-center">¡Gracias por su compra!</p>
    </div>
  );
}
