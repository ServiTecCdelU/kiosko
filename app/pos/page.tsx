"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, ArrowLeft, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { useCart } from "@/hooks/useCart";
import { searchProducts, findProductByCode } from "@/services/products-service";
import { createSale } from "@/services/sales-service";
import { getCajaAbierta } from "@/services/caja-service";
import { getCurrentUser } from "@/hooks/use-auth";
import { CartPanel, type ConfirmData, type CartPanelHandle } from "@/components/pos/cart-panel";
import { AuthGuard } from "@/components/auth/auth-guard";
import type { Product } from "@/lib/types";

export default function PosPage() {
  return (
    <AuthGuard>
      <PosScreen />
    </AuthGuard>
  );
}

function PosScreen() {
  const cart = useCart();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cajaId, setCajaId] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<CartPanelHandle>(null);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    focusInput();
    getCajaAbierta()
      .then((c) => setCajaId(c?.id))
      .catch(() => setCajaId(undefined));
  }, [focusInput]);

  // Atajos de teclado para mostrador: F2 cobrar · F3 buscar · Esc limpiar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        cartRef.current?.confirm();
      } else if (e.key === "F3") {
        e.preventDefault();
        focusInput();
      } else if (e.key === "Escape") {
        setQuery("");
        setResults([]);
        focusInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusInput]);

  // Busqueda por nombre con debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchProducts(q));
      } catch {
        toast.error("Error al buscar");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const addToCart = useCallback(
    (p: Product) => {
      if (p.stock <= 0) {
        toast.error(`Sin stock: ${p.name}`);
        return;
      }
      const enCarrito = cart.items.find((i) => i.product.id === p.id)?.quantity ?? 0;
      if (enCarrito + 1 > p.stock) {
        toast.error(`Stock maximo (${p.stock}) para ${p.name}`);
        return;
      }
      cart.addProduct(p, 1);
    },
    [cart],
  );

  // Enter: el lector de codigo de barras "tipea" + Enter. Match exacto -> agrega directo.
  const handleEnter = useCallback(async () => {
    const value = query.trim();
    if (!value) return;
    try {
      const found = await findProductByCode(value);
      if (found) {
        addToCart(found);
        setQuery("");
        setResults([]);
        focusInput();
        return;
      }
      if (results.length === 1) {
        addToCart(results[0]);
        setQuery("");
        setResults([]);
        focusInput();
      }
    } catch {
      toast.error("Error al buscar");
    }
  }, [query, results, addToCart, focusInput]);

  const handleConfirm = useCallback(
    async (data: ConfirmData) => {
      setProcessing(true);
      try {
        const user = getCurrentUser();
        const res = await createSale({
          items: cart.items.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            quantity: i.quantity,
            price: i.product.price,
          })),
          paymentMethod: data.paymentMethod,
          cashAmount: data.cashAmount,
          changeAmount: data.changeAmount,
          transferAmount: data.transferAmount,
          cajaId,
          userId: user?.id,
          userName: user?.nombre,
        });
        const vuelto = data.changeAmount > 0 ? ` · Vuelto ${formatCurrency(data.changeAmount)}` : "";
        toast.success(`Ticket #${res.saleNumber}${vuelto}`);
        cart.clear();
        setQuery("");
        setResults([]);
        focusInput();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cobrar");
      } finally {
        setProcessing(false);
      }
    },
    [cart, focusInput, cajaId],
  );

  return (
    <main className="bg-mesh flex h-screen flex-col bg-muted/30">
      <header className="glass flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">Punto de Venta</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <Kbd>F2</Kbd> Cobrar
            <Kbd>F3</Kbd> Buscar
            <Kbd>Esc</Kbd> Limpiar
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
              cajaId ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                cajaId ? "bg-success animate-pulse-soft" : "bg-warning",
              )}
            />
            <ScanLine className="h-4 w-4" /> {cajaId ? "Caja abierta" : "Caja cerrada"}
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_380px]">
        {/* Busqueda + resultados */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleEnter();
                }
              }}
              placeholder="Escanea un codigo o busca por nombre..."
              className="h-12 rounded-2xl pl-11 text-base"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-card p-2">
            {query.trim().length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Escribi al menos 2 letras o escanea un producto
              </p>
            ) : searching ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {results.map((p) => {
                  const sinStock = p.stock <= 0;
                  const stockBajo = !sinStock && p.stock <= p.stockMinimo;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => addToCart(p)}
                        disabled={sinStock}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                          sinStock ? "opacity-50" : "hover:border-primary hover:bg-primary/5",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
                          <span
                            className={cn(
                              "text-xs",
                              sinStock ? "text-destructive" : stockBajo ? "text-warning" : "text-muted-foreground",
                            )}
                          >
                            {sinStock ? "Sin stock" : `Stock: ${p.stock}`}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-primary">
                          {formatCurrency(p.price)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Carrito + cobro */}
        <div className="min-h-0">
          <CartPanel
            ref={cartRef}
            items={cart.items}
            total={cart.total}
            onSetQuantity={cart.setQuantity}
            onRemove={cart.removeProduct}
            onClear={cart.clear}
            onConfirm={handleConfirm}
            processing={processing}
          />
        </div>
      </div>
    </main>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
      {children}
    </kbd>
  );
}
