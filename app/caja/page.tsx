"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Wallet, LockOpen, Lock, TrendingUp, Banknote, CreditCard,
  ArrowDownCircle, ArrowUpCircle, Receipt, Ban,
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
import {
  getCajaAbierta, getResumenCaja, abrirCaja, cerrarCaja, getCajaHistorial,
  getMovimientosCaja, registrarMovimientoCaja, getVentasPorCajero,
  type ResumenCaja, type VentasPorCajero,
} from "@/services/caja-service";
import { getVentasDeCaja, anularVenta } from "@/services/sales-service";
import { MovimientoDialog } from "@/components/caja/movimiento-dialog";
import { AnularVentaDialog } from "@/components/caja/anular-venta-dialog";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Caja, CajaMovimiento, CajaMovTipo, Sale } from "@/lib/types";

export default function CajaPage() {
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
  const [ventaAnular, setVentaAnular] = useState<Sale | null>(null);

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

  const esperadoEfectivo = caja && resumen
    ? caja.montoApertura + resumen.totalEfectivo + resumen.totalAportes - resumen.totalRetiros - resumen.totalGastos
    : 0;

  return (
    <AppShell title="Caja">
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
          <div className="flex items-center gap-2">
            <Badge className="bg-success text-success-foreground">
              <Wallet className="mr-1 h-3 w-3" /> Caja abierta
            </Badge>
            <span className="text-sm text-muted-foreground">desde {formatDateTime(caja.openedAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Apertura" value={formatCurrency(caja.montoApertura)} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Ventas efectivo" value={formatCurrency(resumen?.totalEfectivo ?? 0)} icon={<Banknote className="h-4 w-4" />} />
            <StatCard label="Ventas transfer." value={formatCurrency(resumen?.totalTransferencia ?? 0)} icon={<CreditCard className="h-4 w-4" />} />
            <StatCard label="Total vendido" value={formatCurrency(resumen?.totalVentas ?? 0)} icon={<TrendingUp className="h-4 w-4" />} highlight />
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
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movimientos.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDateTime(m.fecha)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn(
                              m.tipo === "aporte" && "border-money/50 text-money",
                              m.tipo === "retiro" && "border-warning text-warning",
                              m.tipo === "gasto" && "border-destructive/50 text-destructive",
                            )}>
                              {m.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.concepto || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(m.monto)}</TableCell>
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
                          <TableCell className="text-right font-medium">{formatCurrency(c.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {ventas.length > 0 && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Ventas de esta caja</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Pago</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        {esAdmin && <TableHead className="text-right">Acción</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ventas.map((v) => (
                        <TableRow key={v.id} className={v.estado === "anulada" ? "opacity-50" : ""}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDateTime(v.createdAt)}</TableCell>
                          <TableCell className="text-sm">{v.saleNumber ?? v.id}</TableCell>
                          <TableCell className="text-sm capitalize">{v.paymentMethod}</TableCell>
                          <TableCell className="text-right font-medium">
                            {v.estado === "anulada" ? (
                              <span className="line-through">{formatCurrency(v.total)}</span>
                            ) : (
                              formatCurrency(v.total)
                            )}
                          </TableCell>
                          {esAdmin && (
                            <TableCell className="text-right">
                              {v.estado === "anulada" ? (
                                <Badge variant="outline" className="border-destructive/50 text-destructive">
                                  <Ban className="mr-1 h-3 w-3" /> Anulada
                                </Badge>
                              ) : (
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setVentaAnular(v)}>
                                  Anular
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="max-w-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" /> Cerrar caja
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Apertura + ventas efectivo</span>
                  <span>{formatCurrency(caja.montoApertura + (resumen?.totalEfectivo ?? 0))}</span>
                </div>
                {(resumen?.totalAportes ?? 0) > 0 && (
                  <div className="flex justify-between text-money">
                    <span>+ Aportes</span>
                    <span>{formatCurrency(resumen?.totalAportes ?? 0)}</span>
                  </div>
                )}
                {(resumen?.totalRetiros ?? 0) > 0 && (
                  <div className="flex justify-between text-warning">
                    <span>− Retiros</span>
                    <span>{formatCurrency(resumen?.totalRetiros ?? 0)}</span>
                  </div>
                )}
                {(resumen?.totalGastos ?? 0) > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>− Gastos</span>
                    <span>{formatCurrency(resumen?.totalGastos ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Efectivo esperado</span>
                  <span>{formatCurrency(esperadoEfectivo)}</span>
                </div>
              </div>
              <Input
                type="number" inputMode="decimal" placeholder="Efectivo contado"
                value={montoCierre} onChange={(e) => setMontoCierre(e.target.value)}
                className="rounded-xl"
              />
              <Button variant="destructive" className="w-full rounded-2xl" disabled={working} onClick={handleCerrar}>
                {working ? "Cerrando..." : "Cerrar caja"}
              </Button>
            </CardContent>
          </Card>

          {historial.length > 0 && <Historial historial={historial} />}
        </div>
      )}

      {!caja && !loading && historial.length > 0 && (
        <div className="mt-6">
          <Historial historial={historial} />
        </div>
      )}

      <MovimientoDialog tipo={movTipo} onOpenChange={(o) => !o && setMovTipo(null)} onSubmit={handleMovimiento} />
      <AnularVentaDialog venta={ventaAnular} onOpenChange={(o) => !o && setVentaAnular(null)} onSubmit={handleAnular} />
    </AppShell>
  );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={cn("rounded-2xl", highlight && "card-premium border-0")}>
      <CardContent className="p-4">
        <div className="eyebrow flex items-center gap-1.5">{icon}{label}</div>
        <p className={highlight ? "cifra-hero text-money mt-1.5 text-4xl" : "cifra mt-1 text-2xl font-bold"}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Historial({ historial }: { historial: Caja[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">Cierres anteriores</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cierre</TableHead>
                <TableHead className="text-right">Apertura</TableHead>
                <TableHead className="text-right">Efectivo</TableHead>
                <TableHead className="text-right">Transfer.</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap text-sm">{c.closedAt ? formatDateTime(c.closedAt) : "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.montoApertura)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.totalEfectivo)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.totalTransferencia)}</TableCell>
                  <TableCell className={`text-right font-medium ${(c.diferencia ?? 0) < 0 ? "text-destructive" : (c.diferencia ?? 0) > 0 ? "text-warning" : ""}`}>
                    {formatCurrency(c.diferencia ?? 0)}
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
