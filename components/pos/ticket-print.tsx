// components/pos/ticket-print.tsx — ticket termico 80mm, no fiscal
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { cantidadTexto } from "@/lib/cantidad";
import type { PaymentMethod } from "@/lib/types";
import type { Unidad } from "@/lib/unidades";
import { formatearCuit, type EncabezadoTicket } from "@/lib/ticket-negocio";

export interface TicketData {
  /** Nombre del negocio (el de los carteles, por navegador). */
  comercio?: string;
  /** Logo, direccion, telefono y CUIT (Mi comercio → Datos del ticket). */
  encabezado?: EncabezadoTicket;
  saleNumber: string;
  createdAt: Date;
  /** ahorro: lo que la oferta le desconto a esa linea (price y subtotal ya vienen con la oferta). */
  items: { name: string; quantity: number; price: number; subtotal: number; unidad: Unidad; ahorro?: number }[];
  total: number;
  /** Suma de lo que el cliente se ahorro con ofertas de catalogo. */
  ahorroOfertas?: number;
  /** Lineas de publicidad al pie ("Yerba 1kg 3x2 $2.000"). */
  ofertasDestacadas?: string[];
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

// Lo que decia fijo el ticket antes de que cada comercio cargara su nombre
const NOMBRE_POR_DEFECTO = "Supermercado Patricia";

export function TicketPrint({ ticket }: { ticket: TicketData | null }) {
  if (!ticket) return null;

  return (
    <div id="ticket-print" className="bg-white p-2 font-mono text-[11px] leading-tight text-black">
      {ticket.encabezado?.logo?.vista && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ticket.encabezado.logo.vista} alt="" className="mx-auto mb-1 max-h-16" />
      )}
      <p className="text-center text-sm font-bold">{ticket.comercio || NOMBRE_POR_DEFECTO}</p>
      {ticket.encabezado?.direccion && <p className="text-center">{ticket.encabezado.direccion}</p>}
      {ticket.encabezado?.telefono && <p className="text-center">Tel: {ticket.encabezado.telefono}</p>}
      {ticket.encabezado?.cuit && <p className="text-center">CUIT: {formatearCuit(ticket.encabezado.cuit)}</p>}
      <p className="text-center">Ticket no fiscal</p>
      <p className="text-center">{formatDateTime(ticket.createdAt)}</p>
      <p className="text-center">#{ticket.saleNumber}</p>
      <div className="my-1 border-t border-dashed border-black" />
      {ticket.items.map((it, i) => (
        <div key={i} className="mb-0.5">
          <p className="line-clamp-2">{it.name}</p>
          <div className="flex justify-between">
            <span>
              {cantidadTexto(it.quantity, it.unidad)} x {formatCurrency(it.price)}
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
      {!!ticket.ahorroOfertas && ticket.ahorroOfertas >= 1 && (
        <>
          <div className="my-1 border-t border-dashed border-black" />
          <p className="text-center text-sm font-bold">*** USTED AHORRÓ {formatCurrency(ticket.ahorroOfertas)} ***</p>
          <p className="text-center">con nuestras ofertas</p>
        </>
      )}
      {!!ticket.ofertasDestacadas?.length && (
        <>
          <div className="my-1 border-t border-dashed border-black" />
          <p className="text-center font-bold">HOY EN OFERTA</p>
          {ticket.ofertasDestacadas.map((o, i) => <p key={i} className="line-clamp-2">★ {o}</p>)}
        </>
      )}
      <div className="my-1 border-t border-dashed border-black" />
      <p className="text-center">¡Gracias por su compra!</p>
    </div>
  );
}
