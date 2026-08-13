"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Trash2, Plus, Minus, Banknote, CreditCard, Coins, NotebookPen, ShoppingCart, QrCode, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { precioLinea, tieneOferta, comboLabel } from "@/lib/pricing";
import { ClienteSelector } from "@/components/pos/cliente-selector";
import type { CartItem, Cliente, PaymentMethod } from "@/lib/types";

export interface ConfirmData {
  paymentMethod: PaymentMethod;
  cashAmount: number;
  changeAmount: number;
  transferAmount: number;
  clienteId?: string;
}

/** Handle imperativo para disparar el cobro desde un atajo de teclado (F2). */
export interface CartPanelHandle {
  confirm: () => void;
}

interface CartPanelProps {
  items: CartItem[];
  total: number;
  onSetQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onConfirm: (data: ConfirmData) => void;
  onSuspend?: () => void;
  processing: boolean;
  /** Los metodos de Mercado Pago necesitan conexion: se deshabilitan sin ella. */
  isOnline?: boolean;
}

export const CartPanel = forwardRef<CartPanelHandle, CartPanelProps>(function CartPanel(
  { items, total, onSetQuantity, onRemove, onClear, onConfirm, onSuspend, processing, isOnline = true },
  ref,
) {
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [pagaCon, setPagaCon] = useState("");
  const [efectivoMixto, setEfectivoMixto] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setPagaCon("");
      setEfectivoMixto("");
      setCliente(null);
    }
  }, [items.length]);

  const pagaConNum = Number(pagaCon) || 0;
  const vuelto = method === "efectivo" ? Math.max(0, pagaConNum - total) : 0;
  const faltaEfectivo = method === "efectivo" && pagaConNum < total;

  // Mixto: el efectivo ingresado es la porcion en mano; el resto va por transferencia.
  const cashPortion = method === "mixto" ? Math.min(Math.max(0, Number(efectivoMixto) || 0), total) : 0;
  const transferPortion = method === "mixto" ? total - cashPortion : 0;

  const faltaCliente = method === "fiado" && !cliente;

  // Limite de credito: 0 = sin limite. La validacion definitiva la hace la RPC
  // (process_sale_kiosko), esto es para avisar antes de confirmar.
  const deudaProyectada = cliente ? cliente.saldo + total : 0;
  const excedeCredito =
    method === "fiado" &&
    !!cliente &&
    cliente.limiteCredito > 0 &&
    deudaProyectada > cliente.limiteCredito;

  const disabled = items.length === 0 || processing || faltaEfectivo || faltaCliente || excedeCredito;

  const handleConfirm = () => {
    if (disabled) return;
    if (method === "transferencia") {
      onConfirm({ paymentMethod: "transferencia", cashAmount: 0, changeAmount: 0, transferAmount: total });
    } else if (method === "mixto") {
      onConfirm({ paymentMethod: "mixto", cashAmount: cashPortion, changeAmount: 0, transferAmount: transferPortion });
    } else if (method === "fiado") {
      onConfirm({ paymentMethod: "fiado", cashAmount: 0, changeAmount: 0, transferAmount: 0, clienteId: cliente?.id });
    } else if (method === "mercadopago") {
      onConfirm({ paymentMethod: "mercadopago", cashAmount: 0, changeAmount: 0, transferAmount: total });
    } else if (method === "mercadopago_point") {
      onConfirm({ paymentMethod: "mercadopago_point", cashAmount: 0, changeAmount: 0, transferAmount: total });
    } else {
      onConfirm({ paymentMethod: "efectivo", cashAmount: pagaConNum, changeAmount: vuelto, transferAmount: 0 });
    }
  };

  useImperativeHandle(ref, () => ({ confirm: handleConfirm }));

  return (
    <div className="card-premium flex h-full flex-col rounded-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-4 w-4 text-primary" /> Carrito
        </span>
        {items.length > 0 && (
          <div className="flex items-center gap-1">
            {onSuspend && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSuspend}>
                Suspender
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClear}>
              Vaciar
            </Button>
          </div>
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
                  <span className="line-clamp-2 text-sm font-medium">
                    {i.product.name}
                    {comboLabel(i.product) && (
                      <span className="ml-1.5 rounded-md bg-money/15 px-1.5 py-0.5 text-[10px] font-semibold text-money">
                        {comboLabel(i.product)}
                      </span>
                    )}
                  </span>
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
                    {(() => {
                      const step = i.product.unidad === "kg" ? 0.1 : 1;
                      return (
                        <>
                          <Button
                            variant="outline" size="icon" className="h-7 w-7 rounded-lg"
                            onClick={() => onSetQuantity(i.product.id, i.quantity - step)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-12 text-center text-sm font-semibold">
                            {i.product.unidad === "kg" ? `${i.quantity.toFixed(2)}kg` : i.quantity}
                          </span>
                          <Button
                            variant="outline" size="icon" className="h-7 w-7 rounded-lg"
                            onClick={() => onSetQuantity(i.product.id, i.quantity + step)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                  <div className="text-right">
                    {tieneOferta(i.product) && (
                      <span className="mr-1.5 text-xs text-muted-foreground line-through">
                        {formatCurrency(i.product.price * i.quantity)}
                      </span>
                    )}
                    <span className={cn("cifra text-sm font-semibold", tieneOferta(i.product) && "text-money")}>
                      {formatCurrency(precioLinea(i.product, i.quantity))}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border/60 p-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="eyebrow">Total</span>
          <span className="cifra-hero text-money text-5xl">{formatCurrency(total)}</span>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-1.5">
          <MethodButton active={method === "efectivo"} onClick={() => setMethod("efectivo")} icon={<Banknote className="h-4 w-4" />} label="Efectivo" />
          <MethodButton active={method === "transferencia"} onClick={() => setMethod("transferencia")} icon={<CreditCard className="h-4 w-4" />} label="Transfer." />
          <MethodButton active={method === "mixto"} onClick={() => setMethod("mixto")} icon={<Coins className="h-4 w-4" />} label="Mixto" />
          <MethodButton active={method === "mercadopago"} onClick={() => setMethod("mercadopago")} icon={<QrCode className="h-4 w-4" />} label="MP QR" disabled={!isOnline} title={!isOnline ? "Necesita conexión a internet" : undefined} />
          <MethodButton active={method === "mercadopago_point"} onClick={() => setMethod("mercadopago_point")} icon={<Radio className="h-4 w-4" />} label="MP Point" disabled={!isOnline} title={!isOnline ? "Necesita conexión a internet" : undefined} />
          <MethodButton active={method === "fiado"} onClick={() => setMethod("fiado")} icon={<NotebookPen className="h-4 w-4" />} label="Fiado" />
        </div>

        {method === "fiado" && <ClienteSelector cliente={cliente} onSelect={setCliente} />}

        {method === "fiado" && cliente && (
          <div
            className={cn(
              "mb-3 rounded-xl px-3 py-2 text-sm",
              excedeCredito ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span>Debe ahora</span>
              <span className="cifra font-semibold">{formatCurrency(cliente.saldo)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Con esta venta</span>
              <span className="cifra font-semibold">{formatCurrency(deudaProyectada)}</span>
            </div>
            {cliente.limiteCredito > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span>Límite</span>
                <span className="cifra font-semibold">{formatCurrency(cliente.limiteCredito)}</span>
              </div>
            )}
            {excedeCredito && (
              <p className="mt-1 font-semibold">
                Supera el límite de crédito. Cobrá una parte o subile el límite al cliente.
              </p>
            )}
          </div>
        )}

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

        {method === "mixto" && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal" placeholder="Efectivo en mano"
                value={efectivoMixto} onChange={(e) => setEfectivoMixto(e.target.value)}
                className="rounded-xl"
              />
              <Button variant="outline" className="rounded-xl" onClick={() => setEfectivoMixto(String(total))}>
                Todo
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Banknote className="h-3.5 w-3.5" /> Efectivo
              </span>
              <span className="cifra font-semibold">{formatCurrency(cashPortion)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" /> Transferencia
              </span>
              <span className="cifra font-semibold">{formatCurrency(transferPortion)}</span>
            </div>
          </div>
        )}

        <Button
          className={cn(
            "h-16 w-full rounded-2xl border-0 text-xl font-bold tracking-tight text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none disabled:opacity-60",
            !disabled && "grad-money shadow-money",
          )}
          disabled={disabled}
          onClick={handleConfirm}
        >
          {processing ? "Procesando..." : "Cobrar"}
        </Button>
      </div>
    </div>
  );
});

function MethodButton({
  active, onClick, icon, label, disabled, title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl border py-2 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
