// services/sales-service.ts — alta de ventas (client helper hacia /api/ventas)
import type { PaymentMethod } from "@/lib/types";

export interface CreateSaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface CreateSaleInput {
  items: CreateSaleItem[];
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  transferAmount?: number;
  changeAmount?: number;
  discount?: number;
  cajaId?: string;
  userId?: string;
  userName?: string;
}

export interface ProcessSaleResult {
  id: string;
  saleNumber: string;
  total: number;
}

export async function createSale(input: CreateSaleInput): Promise<ProcessSaleResult> {
  const res = await fetch("/api/ventas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar la venta");
  return data as ProcessSaleResult;
}
