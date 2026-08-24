"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Receipt, TrendingUp, Banknote, CreditCard, NotebookPen, ChevronDown, Search, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { metodoLabel, metodoColorClass, metodoLabelConCuotas } from "@/lib/utils/metodo-pago";
import { getVentasDeRango, anularVenta } from "@/services/sales-service";
import { AnularVentaDialog } from "@/components/caja/anular-venta-dialog";
import { SaleDetailDialog } from "@/components/ventas/sale-detail-dialog";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Sale, PaymentMethod } from "@/lib/types";

const METODOS_FILTRO: PaymentMethod[] = [
  "efectivo", "transferencia", "debito", "credito", "mixto", "fiado", "mercadopago", "mercadopago_point",
];

type Rango = "hoy" | "semana" | "mes";

function rangoFechas(rango: Rango): { desde: Date; hasta: Date } {
  const hasta = new Date();
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  if (rango === "semana") desde.setDate(desde.getDate() - 6);
  else if (rango === "mes") desde.setDate(1);
  return { desde, hasta };
}

function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

const TABS: { value: Rango; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "7 dias" },
  { value: "mes", label: "Mes" },
];

export default function VentasPage() {
  const [rango, setRango] = useState<Rango>("hoy");
  const [ventas, setVentas] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [ventaDetalle, setVentaDetalle] = useState<Sale | null>(null);
  const [ventaAnular, setVentaAnular] = useState<Sale | null>(null);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroMetodo, setFiltroMetodo] = useState<PaymentMethod | "todos">("todos");

  const user = getCurrentUser();
  const esAdmin = user?.rol === "admin";

  const load = useCallback(async (r: Rango) => {
    setLoading(true);
    try {
      const { desde, hasta } = rangoFechas(r);
      setVentas(await getVentasDeRango(desde, hasta));
    } catch {
      toast.error("No se pudieron cargar las ventas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rango);
  }, [rango, load]);

  const handleAnular = async (motivo: string) => {
    if (!ventaAnular) return;
    try {
      await anularVenta({ ventaId: ventaAnular.id, motivo, usuarioId: user?.id, usuarioNombre: user?.nombre });
      toast.success("Venta anulada, stock devuelto");
      await load(rango);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al anular la venta");
    }
  };

  const ventasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ventas.filter((v) => {
      if (filtroMetodo !== "todos" && v.paymentMethod !== filtroMetodo) return false;
      if (!q) return true;
      const enTicket = (v.saleNumber ?? v.id).toLowerCase().includes(q);
      const enProducto = v.items.some((i) => i.name.toLowerCase().includes(q));
      const enPagador = (v.pagadorNombre ?? "").toLowerCase().includes(q);
      return enTicket || enProducto || enPagador;
    });
  }, [ventas, busqueda, filtroMetodo]);

  const hayFiltrosActivos = busqueda.trim().length > 0 || filtroMetodo !== "todos";

  const vigentes = useMemo(() => ventasFiltradas.filter((v) => v.estado !== "anulada"), [ventasFiltradas]);

  const resumen = useMemo(() => {
    let total = 0, efectivo = 0, transferencia = 0, tarjeta = 0, mercadopago = 0, fiado = 0;
    for (const v of vigentes) {
      total += v.total;
      if (v.paymentMethod === "efectivo") efectivo += v.total;
      else if (v.paymentMethod === "transferencia" || v.paymentMethod === "mixto") transferencia += v.total;
      else if (v.paymentMethod === "debito" || v.paymentMethod === "credito" || v.paymentMethod === "tarjeta") tarjeta += v.total;
      else if (v.paymentMethod === "mercadopago" || v.paymentMethod === "mercadopago_point") mercadopago += v.total;
      else if (v.paymentMethod === "fiado") fiado += v.total;
    }
    return { total, cantidad: vigentes.length, efectivo, transferencia, tarjeta, mercadopago, fiado };
  }, [vigentes]);

  return (
    <AppShell title="Ventas">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setRango(t.value)}
              className={cn(
                "rounded-xl px-4 py-1.5 text-sm font-medium transition-colors",
                rango === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setMostrarResumen((v) => !v)}
          className="flex items-center gap-1 rounded-xl border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground lg:hidden"
        >
          Resumen <ChevronDown className={cn("h-4 w-4 transition-transform", mostrarResumen && "rotate-180")} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn("grid grid-cols-2 gap-2.5 lg:grid-cols-6", !mostrarResumen && "hidden lg:grid")}>
            <MiniStat
              label="Total" value={formatCurrency(resumen.total)} icon={<TrendingUp className="h-4 w-4" />}
              bgClass="bg-gradient-to-br from-money to-emerald-600 text-white" solid
            />
            <MiniStat
              label="Ventas" value={String(resumen.cantidad)} icon={<Receipt className="h-4 w-4" />}
              bgClass="bg-primary/10 text-primary" iconBgClass="bg-primary/15 text-primary"
            />
            <MiniStat
              label="Efectivo" value={formatCurrency(resumen.efectivo)} icon={<Banknote className="h-4 w-4" />}
              bgClass="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" iconBgClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            />
            <MiniStat
              label="Transfer." value={formatCurrency(resumen.transferencia)} icon={<CreditCard className="h-4 w-4" />}
              bgClass="bg-sky-500/10 text-sky-700 dark:text-sky-400" iconBgClass="bg-sky-500/15 text-sky-600 dark:text-sky-400"
            />
            <MiniStat
              label="Tarjeta" value={formatCurrency(resumen.tarjeta)} icon={<CreditCard className="h-4 w-4" />}
              bgClass="bg-violet-500/10 text-violet-700 dark:text-violet-400" iconBgClass="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            />
            <MiniStat
              label="Fiado" value={formatCurrency(resumen.fiado)} icon={<NotebookPen className="h-4 w-4" />}
              bgClass="bg-rose-500/10 text-rose-700 dark:text-rose-400" iconBgClass="bg-rose-500/15 text-rose-600 dark:text-rose-400"
            />
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="gap-3">
              <CardTitle className="text-base">Desglose de ventas</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por ticket, producto o quién pagó"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="rounded-xl pl-9"
                  />
                  {busqueda && (
                    <button
                      onClick={() => setBusqueda("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select value={filtroMetodo} onValueChange={(v) => setFiltroMetodo(v as PaymentMethod | "todos")}>
                  <SelectTrigger className="rounded-xl sm:w-44">
                    <SelectValue placeholder="Método de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los métodos</SelectItem>
                    {METODOS_FILTRO.map((m) => (
                      <SelectItem key={m} value={m}>{metodoLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {ventasFiltradas.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {hayFiltrosActivos ? "Ninguna venta coincide con el filtro" : "Sin ventas en el periodo"}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="hidden lg:table-cell">Ticket</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="hidden lg:table-cell">Pagó</TableHead>
                        <TableHead className="hidden lg:table-cell">Cajero</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventasFiltradas.map((v) => (
                        <TableRow
                          key={v.id}
                          onClick={() => setVentaDetalle(v)}
                          className={cn("cursor-pointer hover:bg-muted/50", v.estado === "anulada" && "opacity-50")}
                        >
                          <TableCell className="whitespace-nowrap text-sm">
                            <span className="lg:hidden">{fechaCorta(v.createdAt)}</span>
                            <span className="hidden lg:inline">{formatDateTime(v.createdAt)}</span>
                          </TableCell>
                          <TableCell className="hidden text-sm lg:table-cell">{v.saleNumber ?? v.id}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {v.items.reduce((s, i) => s + i.quantity, 0)}
                          </TableCell>
                          <TableCell>
                            <Badge className={metodoColorClass(v.paymentMethod)}>{metodoLabelConCuotas(v)}</Badge>
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                            {v.pagadorNombre ?? "—"}
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{v.userName ?? "—"}</TableCell>
                          <TableCell className="cifra text-right font-medium">
                            {v.estado === "anulada" ? (
                              <span className="line-through">{formatCurrency(v.total)}</span>
                            ) : (
                              formatCurrency(v.total)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <SaleDetailDialog
        venta={ventaDetalle}
        onOpenChange={(o) => !o && setVentaDetalle(null)}
        esAdmin={esAdmin}
        onAnular={(v) => {
          setVentaDetalle(null);
          setVentaAnular(v);
        }}
      />
      <AnularVentaDialog venta={ventaAnular} onOpenChange={(o) => !o && setVentaAnular(null)} onSubmit={handleAnular} />
    </AppShell>
  );
}

function MiniStat({
  label, value, icon, bgClass, iconBgClass, solid,
}: {
  label: string; value: string; icon?: React.ReactNode; bgClass?: string; iconBgClass?: string; solid?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 rounded-2xl border-0 px-3 py-4 text-center shadow-sm transition-transform hover:-translate-y-0.5", bgClass)}>
      {icon && (
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", solid ? "bg-white/20" : iconBgClass)}>
          {icon}
        </span>
      )}
      <p className={cn("text-[11px] font-medium uppercase tracking-wide sm:text-xs", solid ? "text-white/85" : "opacity-70")}>
        {label}
      </p>
      <p className="cifra truncate text-base font-extrabold sm:text-lg">{value}</p>
    </div>
  );
}
