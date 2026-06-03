"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Minus, Banknote, CreditCard, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import type { CartItem, PaymentMethod } from "@/lib/types";

export interface ConfirmData {
  paymentMethod: PaymentMethod;
  cashAmount: number;
  changeAmount: number;
  transferAmount: number;
}

interface CartPanelProps {
  items: CartItem[];
  total: number;
  onSetQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onConfirm: (data: ConfirmData) => void;
  processing: boolean;
}

export function CartPanel({
  items, total, onSetQuantity, onRemove, onClear, onConfirm, processing,
}: CartPanelProps) {
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [pagaCon, setPagaCon] = useState("");

  useEffect(() => {
    if (items.length === 0) setPagaCon("");
  }, [items.length]);

  const pagaConNum = Number(pagaCon) || 0;
  const vuelto = method === "efectivo" ? Math.max(0, pagaConNum - total) : 0;
  const faltaEfectivo = method === "efectivo" && pagaConNum < total;
  const disabled = items.length === 0 || processing || faltaEfectivo;

  const handleConfirm = () => {
    if (disabled) return;
    onConfirm({
      paymentMethod: method,
      cashAmount: method === "efectivo" ? pagaConNum : 0,
      changeAmount: vuelto,
      transferAmount: method === "transferencia" ? total : 0,
    });
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-4 w-4 text-primary" /> Carrito
        </span>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClear}>
            Vaciar
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Escanea o busca un producto
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.product.id} className="rounded-xl px-2 py-2 hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-medium">{i.product.name}</span>
                  <button
                    onClick={() => onRemove(i.product.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="icon" className="h-7 w-7 rounded-lg"
                      onClick={() => onSetQuantity(i.product.id, i.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold">{i.quantity}</span>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7 rounded-lg"
                      onClick={() => onSetQuantity(i.product.id, i.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatCurrency(i.product.price * i.quantity)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t p-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Total</span>
          <span className="cifra text-4xl font-bold text-primary">{formatCurrency(total)}</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMethod("efectivo")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors",
              method === "efectivo" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <Banknote className="h-4 w-4" /> Efectivo
          </button>
          <button
            onClick={() => setMethod("transferencia")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors",
              method === "transferencia" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <CreditCard className="h-4 w-4" /> Transfer.
          </button>
        </div>

        {method === "efectivo" && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal" placeholder="Paga con"
                value={pagaCon} onChange={(e) => setPagaCon(e.target.value)}
                className="rounded-xl"
              />
              <Button variant="outline" className="rounded-xl" onClick={() => setPagaCon(String(total))}>
                Justo
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Vuelto</span>
              <span className={cn("font-semibold", faltaEfectivo ? "text-destructive" : "text-foreground")}>
                {faltaEfectivo ? "Falta " + formatCurrency(total - pagaConNum) : formatCurrency(vuelto)}
              </span>
            </div>
          </div>
        )}

        <Button
          className="h-14 w-full rounded-2xl border-0 text-lg font-bold text-white shadow-lg shadow-success/25 transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
          style={
            disabled
              ? undefined
              : {
                  backgroundImage:
                    "linear-gradient(135deg, oklch(0.78 0.18 150), oklch(0.60 0.14 200))",
                }
          }
          disabled={disabled}
          onClick={handleConfirm}
        >
          {processing ? "Procesando..." : "Cobrar"}
        </Button>
      </div>
    </div>
  );
}
