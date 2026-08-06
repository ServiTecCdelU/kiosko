"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, ArrowLeft, ScanLine, Printer, PauseCircle, WifiOff, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal, precioLinea, tieneOferta, comboLabel } from "@/lib/pricing";
import { useCart } from "@/hooks/useCart";
import { searchProducts, findProductByCode, getFavoritos } from "@/services/products-service";
import { createSale, NetworkUnavailableError, type CreateSaleInput } from "@/services/sales-service";
import { getCajaAbierta } from "@/services/caja-service";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { buscarProductosOffline, buscarPorCodigoOffline, getFavoritosOffline } from "@/lib/offline/catalog";
import { encolarVentaPendiente, descontarStockOffline } from "@/lib/offline/db";
import { getCurrentUser } from "@/hooks/use-auth";
import { CartPanel, type ConfirmData, type CartPanelHandle } from "@/components/pos/cart-panel";
import { PesoDialog } from "@/components/pos/peso-dialog";
import { TicketPrint, type TicketData } from "@/components/pos/ticket-print";
import { TicketsEsperaDialog } from "@/components/pos/tickets-espera-dialog";
import {
  listarTicketsEnEspera, suspenderTicket, quitarTicketEnEspera, type TicketEnEspera,
} from "@/lib/utils/tickets-espera";
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
  const [favoritos, setFavoritos] = useState<Product[]>([]);
  const [pesoProduct, setPesoProduct] = useState<Product | null>(null);
  const [lastTicket, setLastTicket] = useState<TicketData | null>(null);
  const [ticketsEspera, setTicketsEspera] = useState<TicketEnEspera[]>([]);
  const [esperaOpen, setEsperaOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<CartPanelHandle>(null);
  const { isOnline, pendingCount, syncVentasPendientes } = useOfflineSync();

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    focusInput();
    getCajaAbierta()
      .then((c) => setCajaId(c?.id))
      .catch(() => setCajaId(undefined));
    (isOnline ? getFavoritos() : getFavoritosOffline())
      .then(setFavoritos)
      .catch(() => getFavoritosOffline().then(setFavoritos));
    setTicketsEspera(listarTicketsEnEspera());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusInput]);

  const handleSuspender = useCallback(() => {
    if (cart.items.length === 0) return;
    const nota = window.prompt("Nota para identificar este carrito (opcional):", "") ?? "";
    suspenderTicket(cart.items, nota.trim());
    setTicketsEspera(listarTicketsEnEspera());
    cart.clear();
    toast.success("Venta suspendida");
    focusInput();
  }, [cart, focusInput]);

  const handleRecuperar = useCallback(
    (ticket: TicketEnEspera) => {
      if (cart.items.length > 0) {
        toast.error("Vaciá o cobrá el carrito actual antes de recuperar otro");
        return;
      }
      cart.replaceAll(ticket.items);
      quitarTicketEnEspera(ticket.id);
      setTicketsEspera(listarTicketsEnEspera());
      setEsperaOpen(false);
      focusInput();
    },
    [cart, focusInput],
  );

  const handleDescartarEspera = useCallback((id: string) => {
    quitarTicketEnEspera(id);
    setTicketsEspera(listarTicketsEnEspera());
  }, []);

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
        setResults(isOnline ? await searchProducts(q) : await buscarProductosOffline(q));
      } catch {
        setResults(await buscarProductosOffline(q));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, isOnline]);

  const addToCart = useCallback(
    (p: Product) => {
      if (p.stockControlado && p.stock <= 0) {
        toast.error(`Sin stock: ${p.name}`);
        return;
      }
      if (p.unidad === "kg") {
        setPesoProduct(p);
        return;
      }
      if (p.stockControlado) {
        const enCarrito = cart.items.find((i) => i.product.id === p.id)?.quantity ?? 0;
        if (enCarrito + 1 > p.stock) {
          toast.error(`Stock maximo (${p.stock}) para ${p.name}`);
          return;
        }
      }
      cart.addProduct(p, 1);
      if (p.lote && p.lote > 1) {
        toast.info(`${p.name} viene en paquete de ${p.lote} unidades`);
      }
    },
    [cart],
  );

  const confirmarPeso = useCallback(
    (kg: number) => {
      if (!pesoProduct) return;
      if (kg > pesoProduct.stock) {
        toast.error(`Stock maximo (${pesoProduct.stock}kg) para ${pesoProduct.name}`);
        return;
      }
      cart.addProduct(pesoProduct, kg);
    },
    [cart, pesoProduct],
  );

  // Enter: el lector de codigo de barras "tipea" + Enter. Match exacto -> agrega directo.
  const handleEnter = useCallback(async () => {
    const value = query.trim();
    if (!value) return;
    try {
      const found = isOnline
        ? await findProductByCode(value).catch(() => buscarPorCodigoOffline(value))
        : await buscarPorCodigoOffline(value);
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
  }, [query, results, addToCart, focusInput, isOnline]);

  const handleConfirm = useCallback(
    async (data: ConfirmData) => {
      setProcessing(true);
      const user = getCurrentUser();
      const saleInput: CreateSaleInput = {
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
        clienteId: data.clienteId,
        userId: user?.id,
        userName: user?.nombre,
      };

      try {
        let saleNumber: string;
        let total: number;

        if (data.paymentMethod === "fiado") {
          // El fiado necesita validar/actualizar el saldo del cliente en el momento: no se puede encolar offline.
          const res = await createSale(saleInput);
          saleNumber = res.saleNumber;
          total = res.total;
        } else {
          try {
            const res = await createSale(saleInput);
            saleNumber = res.saleNumber;
            total = res.total;
          } catch (e) {
            if (!(e instanceof NetworkUnavailableError)) throw e;
            await encolarVentaPendiente(saleInput);
            for (const i of cart.items) await descontarStockOffline(i.product.id, i.quantity);
            saleNumber = "PENDIENTE";
            total = cart.items.reduce((s, i) => s + precioLinea(i.product, i.quantity), 0);
            toast.warning("Sin conexión: venta guardada, se sincroniza sola al volver el internet");
          }
        }

        const vuelto = data.changeAmount > 0 ? ` · Vuelto ${formatCurrency(data.changeAmount)}` : "";
        if (saleNumber !== "PENDIENTE") toast.success(`Ticket #${saleNumber}${vuelto}`);
        const res = { saleNumber, total };
        setLastTicket({
          saleNumber: res.saleNumber,
          createdAt: new Date(),
          items: cart.items.map((i) => {
            const subtotal = precioLinea(i.product, i.quantity);
            return {
              name: i.product.name,
              quantity: i.quantity,
              price: i.quantity > 0 ? subtotal / i.quantity : 0,
              subtotal,
              unidad: i.product.unidad,
            };
          }),
          total: res.total,
          paymentMethod: data.paymentMethod,
          cashAmount: data.cashAmount,
          changeAmount: data.changeAmount,
          userName: user?.nombre,
        });
        cart.clear();
        setQuery("");
        setResults([]);
        focusInput();
        setTimeout(() => window.print(), 150);
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
          {!isOnline && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive">
              <WifiOff className="h-3.5 w-3.5" /> Sin conexión
            </span>
          )}
          {pendingCount > 0 && (
            <button
              onClick={() => syncVentasPendientes()}
              className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {pendingCount} venta(s) sin sincronizar
            </button>
          )}
          {ticketsEspera.length > 0 && (
            <button
              onClick={() => setEsperaOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
            >
              <PauseCircle className="h-3.5 w-3.5" /> En espera ({ticketsEspera.length})
            </button>
          )}
          {lastTicket && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Printer className="h-3.5 w-3.5" /> Reimprimir
            </button>
          )}
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
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
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
              placeholder="Escaneá un código o buscá por nombre..."
              className="card-premium h-14 rounded-2xl border-0 pl-12 text-base font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-card p-2">
            {query.trim().length < 2 ? (
              favoritos.length > 0 ? (
                <div>
                  <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Productos rápidos</p>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {favoritos.map((p) => {
                      const sinStock = p.stockControlado && p.stock <= 0;
                      return (
                        <li key={p.id}>
                          <button
                            onClick={() => addToCart(p)}
                            disabled={sinStock}
                            className={cn(
                              "flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center transition-colors",
                              sinStock ? "opacity-50" : "hover:border-primary hover:bg-primary/5",
                            )}
                          >
                            <span className="line-clamp-2 text-xs font-medium">{p.name}</span>
                            <span className="text-sm font-semibold text-primary">{formatCurrency(precioFinal(p))}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Escribi al menos 2 letras o escanea un producto
                </p>
              )
            ) : searching ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {results.map((p) => {
                  const sinStock = p.stockControlado && p.stock <= 0;
                  const stockBajo = p.stockControlado && !sinStock && p.stock <= p.stockMinimo;
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
                          <p className="line-clamp-1 text-sm font-medium">
                            {p.name}
                            {comboLabel(p) && (
                              <span className="ml-1.5 rounded-md bg-money/15 px-1.5 py-0.5 text-[10px] font-semibold text-money">
                                {comboLabel(p)}
                              </span>
                            )}
                          </p>
                          <span
                            className={cn(
                              "text-xs",
                              sinStock ? "text-destructive" : stockBajo ? "text-warning" : "text-muted-foreground",
                            )}
                          >
                            {!p.stockControlado ? "Servicio" : sinStock ? "Sin stock" : `Stock: ${p.stock}`}
                          </span>
                        </div>
                        <span className="shrink-0 text-right">
                          {tieneOferta(p) && (
                            <span className="mr-1.5 text-xs text-muted-foreground line-through">
                              {formatCurrency(p.price)}
                            </span>
                          )}
                          <span className={cn("text-sm font-semibold", tieneOferta(p) ? "text-money" : "text-primary")}>
                            {formatCurrency(precioFinal(p))}{p.unidad === "kg" && "/kg"}
                          </span>
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
            onSuspend={handleSuspender}
            processing={processing}
          />
        </div>
      </div>

      <PesoDialog product={pesoProduct} onOpenChange={(o) => !o && setPesoProduct(null)} onConfirm={confirmarPeso} />
      <TicketPrint ticket={lastTicket} />
      <TicketsEsperaDialog
        open={esperaOpen}
        onOpenChange={setEsperaOpen}
        tickets={ticketsEspera}
        onRecuperar={handleRecuperar}
        onDescartar={handleDescartarEspera}
      />
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
