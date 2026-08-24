// lib/utils/metodo-pago.ts — etiqueta y color por metodo de pago, para
// mostrar el mismo criterio visual en /ventas, /caja y el ticket.
import type { PaymentMethod, Sale } from "@/lib/types";

const LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mixto: "Mixto",
  fiado: "Fiado",
  mercadopago: "MP QR",
  tarjeta: "Tarjeta",
  mercadopago_point: "MP Point",
  debito: "Débito",
  credito: "Crédito",
};

const COLOR: Record<PaymentMethod, string> = {
  efectivo: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  transferencia: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
  debito: "border-transparent bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  credito: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-400",
  mixto: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  fiado: "border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-400",
  mercadopago: "border-transparent bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  mercadopago_point: "border-transparent bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  tarjeta: "border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-400",
};

export function metodoLabel(metodo: PaymentMethod | string): string {
  return LABEL[metodo as PaymentMethod] ?? metodo;
}

export function metodoColorClass(metodo: PaymentMethod | string): string {
  return COLOR[metodo as PaymentMethod] ?? "border-transparent bg-muted text-muted-foreground";
}

/** Color base (RGB 0-255) por metodo, para dibujar en el PDF (jsPDF no entiende clases Tailwind). */
const RGB: Record<PaymentMethod, [number, number, number]> = {
  efectivo: [16, 185, 129],
  transferencia: [14, 165, 233],
  debito: [99, 102, 241],
  credito: [139, 92, 246],
  mixto: [217, 119, 6],
  fiado: [225, 29, 72],
  mercadopago: [8, 145, 178],
  mercadopago_point: [8, 145, 178],
  tarjeta: [100, 116, 139],
};

export function metodoRgb(metodo: PaymentMethod | string): [number, number, number] {
  return RGB[metodo as PaymentMethod] ?? [107, 114, 128];
}

/** Etiqueta del metodo, aclarando cuotas si es credito. Nunca incluye quien pago. */
export function metodoLabelConCuotas(venta: Pick<Sale, "paymentMethod" | "cuotas">): string {
  if (venta.paymentMethod === "credito" && venta.cuotas) {
    return `${metodoLabel(venta.paymentMethod)} (${venta.cuotas} cuotas)`;
  }
  return metodoLabel(venta.paymentMethod);
}
