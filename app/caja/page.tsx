"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Wallet, LockOpen, Lock, TrendingUp, Banknote, CreditCard,
  ArrowDownCircle, ArrowUpCircle, ArrowUpRight, ArrowDownRight, Receipt, QrCode, Download, History,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { metodoColorClass, metodoLabelConCuotas } from "@/lib/utils/metodo-pago";
import { descargarCajaPdf } from "@/lib/utils/caja-pdf";
import {
  getCajaAbierta, getResumenCaja, abrirCaja, cerrarCaja, getCajaHistorial,
  getMovimientosCaja, registrarMovimientoCaja, getVentasPorCajero,
  type ResumenCaja, type VentasPorCajero,
} from "@/services/caja-service";
import { getVentasDeCaja, anularVenta } from "@/services/sales-service";
import { MovimientoDialog } from "@/components/caja/movimiento-dialog";
import { AnularVentaDialog } from "@/components/caja/anular-venta-dialog";
import { SaleDetailDialog } from "@/components/ventas/sale-detail-dialog";
import { CobrosSinResolver } from "@/components/caja/cobros-sin-resolver";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Caja, CajaMovimiento, CajaMovTipo, Sale } from "@/lib/types";

type Tab = "actual" | "historial";

function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export default function CajaPage() {
  const [tab, setTab] = useState<Tab>("actual");
  const [caja, setCaja] = useState<Caja | null>(null);
  const [resumen, setResumen] = useState<ResumenCaja | null>(null);
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([]);
  const [ventas, setVentas] = useState<Sale[]>([]);
  const [ventasPorCajero, setVentasPorCajero] = useState<VentasPorCajero[]>([]);
  const [historial, setHistorial] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [montoApertura, setMontoApertura] = useState("");
  const [montoCierre, setMontoCierre] = useState("");
  const [working, setWorking] = useState(false);
  const [movTipo, setMovTipo] = useState<CajaMovTipo | null>(null);
  const [ventaDetalle, setVentaDetalle] = useState<Sale | null>(null);
  const [ventaAnular, setVentaAnular] = useState<Sale | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);

  const user = getCurrentUser();
  const esAdmin = user?.rol === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const abierta = await getCajaAbierta();
      setCaja(abierta);
      if (abierta) {
        const [res, movs, vts, porCajero] = await Promise.all([
          getResumenCaja(abierta.id),
          getMovimientosCaja(abierta.id),
          getVentasDeCaja(abierta.id),
          getVentasPorCajero(abierta.id),
        ]);
        setResumen(res);
        setMovimientos(movs);
        setVentas(vts);
        setVentasPorCajero(porCajero);
      } else {
        setResumen(null);
        setMovimientos([]);
        setVentas([]);
        setVentasPorCajero([]);
      }
      setHistorial(await getCajaHistorial());
    } catch {
      toast.error("No se pudo cargar la caja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAbrir = async () => {
    const monto = Number(montoApertura) || 0;
    setWorking(true);
    try {
      await abrirCaja(monto, user?.id, user?.nombre);
      toast.success("Caja abierta");
      setMontoApertura("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al abrir caja");
    } finally {
      setWorking(false);
    }
  };

  const handleCerrar = async () => {
    if (!caja) return;
    const contado = Number(montoCierre) || 0;
    setWorking(true);
    try {
      const cerrada = await cerrarCaja(caja.id, caja.montoApertura, contado, user?.id);
      const dif = cerrada.diferencia ?? 0;
      if (dif === 0) toast.success("Caja cerrada · arqueo exacto");
      else if (dif > 0) toast.warning(`Caja cerrada · sobra ${formatCurrency(dif)}`);
      else toast.warning(`Caja cerrada · falta ${formatCurrency(-dif)}`);
      setMontoCierre("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cerrar caja");
    } finally {
      setWorking(false);
    }
  };

  const handleMovimiento = async (monto: number, concepto: string) => {
    if (!caja || !movTipo) return;
    try {
      await registrarMovimientoCaja({
        cajaId: caja.id, tipo: movTipo, monto, concepto,
        usuarioId: user?.id, usuarioNombre: user?.nombre,
      });
      toast.success("Movimiento registrado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar el movimiento");
    }
  };

  const handleAnular = async (motivo: string) => {
    if (!ventaAnular) return;
    try {
      await anularVenta({ ventaId: ventaAnular.id, motivo, usuarioId: user?.id, usuarioNombre: user?.nombre });
      toast.success("Venta anulada, stock devuelto");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al anular la venta");
    }
  };

  const handleDescargarPdf = () => {
    if (!caja) return;
    descargarCajaPdf({ caja, movimientos, ventas });
  };

  const handleDescargarHistorialPdf = async (c: Caja) => {
    setDescargandoId(c.id);
    try {
      const [movs, vts] = await Promise.all([getMovimientosCaja(c.id), getVentasDeCaja(c.id)]);
      descargarCajaPdf({ caja: c, movimientos: movs, ventas: vts });
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setDescargandoId(null);
    }
  };

  const esperadoEfectivo = caja && resumen
    ? caja.montoApertura + resumen.totalEfectivo + resumen.totalAportes - resumen.totalRetiros - resumen.totalGastos
    : 0;

  const ventasVigentes = ventas.filter((v) => v.estado !== "anulada");

  return (
    <AppShell title="Caja">
      <div className="mb-4 inline-flex rounded-2xl border bg-card p-1">
        <button
          onClick={() => setTab("actual")}
          className={cn(
            "rounded-xl px-4 py-1.5 text-sm font-medium transition-colors",
            tab === "actual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Caja actual
        </button>
        <button
          onClick={() => setTab("historial")}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-medium transition-colors",
            tab === "historial" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <History className="h-3.5 w-3.5" /> Historial
        </button>
      </div>

      {tab === "historial" ? (
        loading ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : (
          <HistorialTab historial={historial} descargandoId={descargandoId} onDescargar={handleDescargarHistorialPdf} />
        )
      ) : (
        <>
          {/* Se dibuja solo si hay algo sin resolver, y va afuera del bloque de la
              caja abierta: si el pago fallo, hay que verlo aunque no haya caja. */}
          <div className="mb-4">
            <CobrosSinResolver />
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : !caja ? (
            <Card className="mx-auto max-w-md rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LockOpen className="h-5 w-5 text-primary" /> Abrir caja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Ingresa el monto inicial en efectivo.</p>
                <Input
                  type="number" inputMode="decimal" placeholder="Monto de apertura"
                  value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)}
                  className="rounded-xl"
                />
                <Button className="w-full rounded-2xl" disabled={working} onClick={handleAbrir}>
                  {working ? "Abriendo..." : "Abrir caja"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-success text-success-foreground">
                    <Wallet className="mr-1 h-3 w-3" /> Caja abierta
                  </Badge>
                  <span className="text-sm text-muted-foreground">desde {formatDateTime(caja.openedAt)}</span>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={handleDescargarPdf}>
                  <Download className="mr-2 h-4 w-4" /> Descargar PDF
                </Button>
              </div>

              {/* Cerrar caja va arriba de todo: es la accion mas importante del dia */}
              <Card className="rounded-2xl border-destructive/20 bg-destructive/[0.03]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lock className="h-4 w-4 text-destructive" /> Cerrar caja
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Efectivo esperado</p>
                    <p className="cifra text-money text-2xl font-bold">{formatCurrency(esperadoEfectivo)}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="number" inputMode="decimal" placeholder="Efectivo contado"
                      value={montoCierre} onChange={(e) => setMontoCierre(e.target.value)}
                      className="rounded-xl sm:max-w-xs"
                    />
                    <Button variant="destructive" className="rounded-2xl" disabled={working} onClick={handleCerrar}>
                      {working ? "Cerrando..." : "Cerrar caja"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
                <MiniStat
                  label="Apertura" value={formatCurrency(caja.montoApertura)} icon={<Wallet className="h-3.5 w-3.5" />}
                  bgClass="bg-primary/10 text-primary" iconBgClass="bg-primary/15 text-primary"
                />
                <MiniStat
                  label="Efectivo" value={formatCurrency(resumen?.totalEfectivo ?? 0)} icon={<Banknote className="h-3.5 w-3.5" />}
                  bgClass="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" iconBgClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                />
                <MiniStat
                  label="Transfer." value={formatCurrency(resumen?.totalTransferencia ?? 0)} icon={<CreditCard className="h-3.5 w-3.5" />}
                  bgClass="bg-sky-500/10 text-sky-700 dark:text-sky-400" iconBgClass="bg-sky-500/15 text-sky-600 dark:text-sky-400"
                />
                <MiniStat
                  label="Mercado Pago" value={formatCurrency(resumen?.totalMercadoPago ?? 0)} icon={<QrCode className="h-3.5 w-3.5" />}
                  bgClass="bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" iconBgClass="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                />
                <MiniStat
                  label="Total" value={formatCurrency(resumen?.totalVentas ?? 0)} icon={<TrendingUp className="h-3.5 w-3.5" />}
                  bgClass="bg-gradient-to-br from-money to-emerald-600 text-white" solid
                />
                <MiniStat
                  label="Aportes" value={formatCurrency(resumen?.totalAportes ?? 0)} icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  bgClass="bg-money/10 text-money" iconBgClass="bg-money/15 text-money"
                />
                <MiniStat
                  label="Retiros" value={formatCurrency(resumen?.totalRetiros ?? 0)} icon={<ArrowDownRight className="h-3.5 w-3.5" />}
                  bgClass="bg-amber-500/10 text-amber-700 dark:text-amber-400" iconBgClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                />
                <MiniStat
                  label="Gastos" value={formatCurrency(resumen?.totalGastos ?? 0)} icon={<Receipt className="h-3.5 w-3.5" />}
                  bgClass="bg-rose-500/10 text-rose-700 dark:text-rose-400" iconBgClass="bg-rose-500/15 text-rose-600 dark:text-rose-400"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setMovTipo("aporte")}>
                  <ArrowUpCircle className="mr-2 h-4 w-4 text-money" /> Aporte
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => setMovTipo("retiro")}>
                  <ArrowDownCircle className="mr-2 h-4 w-4 text-warning" /> Retiro
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => setMovTipo("gasto")}>
                  <Receipt className="mr-2 h-4 w-4 text-destructive" /> Gasto
                </Button>
              </div>

              {movimientos.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Movimientos de caja</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Hora</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="hidden sm:table-cell">Concepto</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {movimientos.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                <span className="sm:hidden">{fechaCorta(m.fecha)}</span>
                                <span className="hidden sm:inline">{formatDateTime(m.fecha)}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  m.tipo === "aporte" && "border-money/50 text-money",
                                  m.tipo === "retiro" && "border-warning text-warning",
                                  m.tipo === "gasto" && "border-destructive/50 text-destructive",
                                )}>
                                  {m.tipo}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{m.concepto || "—"}</TableCell>
                              <TableCell className="cifra text-right font-medium">{formatCurrency(m.monto)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {ventasPorCajero.length > 1 && (
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Vendido por cajero</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cajero</TableHead>
                            <TableHead className="text-right">Ventas</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ventasPorCajero.map((c) => (
                            <TableRow key={c.usuarioNombre}>
                              <TableCell className="font-medium">{c.usuarioNombre}</TableCell>
                              <TableCell className="text-right">{c.cantidad}</TableCell>
                              <TableCell className="cifra text-right font-medium">{formatCurrency(c.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Las ventas anuladas no se muestran aca: no suman ni corresponden al arqueo del dia. */}
              {ventasVigentes.length > 0 && (
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Ventas de esta caja</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="hidden lg:table-cell">Ticket</TableHead>
                            <TableHead>Pago</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ventasVigentes.map((v) => (
                            <TableRow
                              key={v.id}
                              onClick={() => setVentaDetalle(v)}
                              className="cursor-pointer hover:bg-muted/50"
                            >
                              <TableCell className="whitespace-nowrap text-sm">
                                <span className="lg:hidden">{fechaCorta(v.createdAt)}</span>
                                <span className="hidden lg:inline">{formatDateTime(v.createdAt)}</span>
                              </TableCell>
                              <TableCell className="hidden text-sm lg:table-cell">{v.saleNumber ?? v.id}</TableCell>
                              <TableCell>
                                <Badge className={metodoColorClass(v.paymentMethod)}>{metodoLabelConCuotas(v)}</Badge>
                              </TableCell>
                              <TableCell className="cifra text-right font-medium">{formatCurrency(v.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <MovimientoDialog tipo={movTipo} onOpenChange={(o) => !o && setMovTipo(null)} onSubmit={handleMovimiento} />
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
    <div className={cn("flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center shadow-sm transition-transform hover:-translate-y-0.5", bgClass)}>
      {icon && (
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", solid ? "bg-white/20" : iconBgClass)}>
          {icon}
        </span>
      )}
      <p className={cn("text-[10px] font-medium uppercase tracking-wide", solid ? "text-white/85" : "opacity-70")}>
        {label}
      </p>
      <p className="cifra truncate text-sm font-extrabold sm:text-base">{value}</p>
    </div>
  );
}

function HistorialTab({
  historial, descargandoId, onDescargar,
}: {
  historial: Caja[]; descargandoId: string | null; onDescargar: (c: Caja) => void;
}) {
  if (historial.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Todavía no hay cierres anteriores
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">Cierres anteriores</CardTitle>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cierre</TableHead>
                <TableHead className="text-right">Apertura</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Efectivo</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Transfer.</TableHead>
                <TableHead className="hidden text-right md:table-cell">Mercado Pago</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    <span className="sm:hidden">{c.closedAt ? fechaCorta(c.closedAt) : "-"}</span>
                    <span className="hidden sm:inline">{c.closedAt ? formatDateTime(c.closedAt) : "-"}</span>
                  </TableCell>
                  <TableCell className="cifra text-right">{formatCurrency(c.montoApertura)}</TableCell>
                  <TableCell className="cifra hidden text-right sm:table-cell">{formatCurrency(c.totalEfectivo)}</TableCell>
                  <TableCell className="cifra hidden text-right sm:table-cell">{formatCurrency(c.totalTransferencia)}</TableCell>
                  <TableCell className="cifra hidden text-right md:table-cell">{formatCurrency(c.totalMercadoPago)}</TableCell>
                  <TableCell className={cn("cifra text-right font-medium", (c.diferencia ?? 0) < 0 ? "text-destructive" : (c.diferencia ?? 0) > 0 ? "text-warning" : "")}>
                    {formatCurrency(c.diferencia ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm" variant="ghost" className="rounded-lg"
                      disabled={descargandoId === c.id}
                      onClick={() => onDescargar(c)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
