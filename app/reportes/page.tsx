"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, Receipt, Banknote, CreditCard, Coins, PiggyBank, ArrowUpRight, QrCode, Clock, CalendarDays, PackageX, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { getReporte, type Reporte } from "@/services/reportes-service";
import { getMayoresAumentos, type AumentoPrecio } from "@/services/products-service";
import { formatDateTime } from "@/lib/utils/format";
import { DIAS_SEMANA_CORTO, etiquetaHora, horaPico } from "@/lib/reportes-tiempo";

type Rango = "hoy" | "semana" | "mes";

function rangoFechas(rango: Rango): { desde: Date; hasta: Date } {
  const hasta = new Date();
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  if (rango === "semana") desde.setDate(desde.getDate() - 6);
  else if (rango === "mes") desde.setDate(1);
  return { desde, hasta };
}

const TABS: { value: Rango; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "7 dias" },
  { value: "mes", label: "Mes" },
];

const compacto = (v: number) => new Intl.NumberFormat("es-AR", { notation: "compact" }).format(v);

export default function ReportesPage() {
  const [rango, setRango] = useState<Rango>("hoy");
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [aumentos, setAumentos] = useState<AumentoPrecio[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: Rango) => {
    setLoading(true);
    try {
      const { desde, hasta } = rangoFechas(r);
      setReporte(await getReporte(desde, hasta));
      getMayoresAumentos(30).then(setAumentos).catch(() => setAumentos([]));
    } catch {
      toast.error("No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rango);
  }, [rango, load]);

  const chartData = useMemo(
    () => (reporte?.porDia ?? []).map((d) => ({
      dia: d.fecha.slice(5),
      total: d.total,
    })),
    [reporte],
  );

  // Solo las horas con movimiento alrededor (de la primera a la ultima venta), para no dibujar 24 barras vacias.
  const horasData = useMemo(() => {
    const h = reporte?.porHora ?? [];
    const conVentas = h.filter((x) => x.cantidad > 0).map((x) => x.hora);
    if (conVentas.length === 0) return [];
    const desde = Math.min(...conVentas);
    const hasta = Math.max(...conVentas);
    return h.slice(desde, hasta + 1).map((x) => ({ hora: `${x.hora}`, total: x.total, cantidad: x.cantidad }));
  }, [reporte]);
  const pico = useMemo(() => (reporte ? horaPico(reporte.porHora) : null), [reporte]);

  const semanaData = useMemo(
    () => (reporte?.porDiaSemana ?? []).map((d) => ({ dia: DIAS_SEMANA_CORTO[d.diaSemana], promedio: d.promedio, total: d.total, cantidad: d.cantidad })),
    [reporte],
  );
  const hayVariosDias = (reporte?.porDia.length ?? 0) > 1;

  const r = reporte?.resumen;

  return (
    <AppShell title="Reportes">
      <div className="mb-4 inline-flex rounded-2xl border bg-card p-1">
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

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Total vendido" value={formatCurrency(r?.totalVentas ?? 0)} icon={<TrendingUp className="h-4 w-4" />} highlight />
            <Kpi label="Ventas" value={String(r?.cantidad ?? 0)} icon={<Receipt className="h-4 w-4" />} />
            <Kpi label="Efectivo" value={formatCurrency(r?.efectivo ?? 0)} icon={<Banknote className="h-4 w-4" />} />
            <Kpi label="Transferencia y tarjeta" value={formatCurrency(r?.transferencia ?? 0)} icon={<CreditCard className="h-4 w-4" />} />
            <Kpi label="Mercado Pago" value={formatCurrency(r?.mercadoPago ?? 0)} icon={<QrCode className="h-4 w-4" />} />
            <Kpi label="Fiado" value={formatCurrency(r?.fiado ?? 0)} icon={<Coins className="h-4 w-4" />} />
            <Kpi
              label="Margen bruto"
              value={r ? `${formatCurrency(r.margenBruto)} (${r.margenPct.toFixed(0)}%)` : "—"}
              icon={<PiggyBank className="h-4 w-4" />}
            />
            <Kpi label="Gastos" value={formatCurrency(r?.gastosTotal ?? 0)} icon={<Wallet className="h-4 w-4" />} />
            <Kpi label="Pérdidas" value={formatCurrency(r?.perdidasTotal ?? 0)} icon={<PackageX className="h-4 w-4" />} />
            <Kpi
              label="Ganancia neta"
              value={formatCurrency(r?.gananciaNeta ?? 0)}
              icon={<TrendingUp className="h-4 w-4" />}
              highlight
            />
          </div>
          {r && r.sinCosto > 0 && (
            <p className="text-xs text-muted-foreground">
              {r.sinCosto} unidades vendidas sin costo cargado — el margen real es mayor a lo mostrado. Cargá el costo en "Editar producto" o en la importación de Excel.
            </p>
          )}

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Ventas por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Sin ventas en el periodo</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                      <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={compacto} />
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                      />
                      <Bar dataKey="total" fill="var(--money)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className={cn("grid gap-4", hayVariosDias && "lg:grid-cols-2")}>
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" /> Ventas por hora
                  {pico && <span className="ml-auto text-xs font-normal text-muted-foreground">Pico: {etiquetaHora(pico.hora)} · {formatCurrency(pico.total)}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {horasData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en el periodo</p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={horasData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="hora" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(h) => `${h}h`} />
                        <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={compacto} />
                        <Tooltip
                          formatter={(v: number, name: string) => (name === "total" ? [formatCurrency(v), "Vendido"] : [v, "Ventas"])}
                          labelFormatter={(h) => etiquetaHora(Number(h))}
                          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                        />
                        <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Para saber cuándo hace falta más gente en la caja. Hora argentina.</p>
              </CardContent>
            </Card>

            {hayVariosDias && (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> Promedio por día de la semana</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={semanaData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                        <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={compacto} />
                        <Tooltip
                          formatter={(v: number) => [formatCurrency(v), "Promedio por día"]}
                          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
                        />
                        <Bar dataKey="promedio" fill="var(--money)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Qué días se vende más, para armar turnos y pedidos.</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Mas vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              {(reporte?.masVendidos.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin datos</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Margen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reporte?.masVendidos.map((p) => (
                        <TableRow key={p.productId}>
                          <TableCell className="line-clamp-1 font-medium">{p.name}</TableCell>
                          <TableCell className="cifra text-right font-semibold">{p.cantidad}</TableCell>
                          <TableCell className="cifra text-right">{formatCurrency(p.total)}</TableCell>
                          <TableCell className="cifra text-right text-xs">
                            {p.margenPct !== undefined ? (
                              <span className={p.margenPct < 0 ? "font-medium text-destructive" : "text-money"}>
                                {formatCurrency(p.margen)} ({p.margenPct.toFixed(0)}%)
                              </span>
                            ) : (
                              <span className="text-muted-foreground">sin costo</span>
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

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Rentabilidad por rubro</CardTitle>
              </CardHeader>
              <CardContent>
                {(reporte?.rentabilidadPorRubro.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sin datos</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rubro</TableHead>
                          <TableHead className="text-right">Vendido</TableHead>
                          <TableHead className="text-right">Margen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reporte?.rentabilidadPorRubro.map((r) => (
                          <TableRow key={r.rubro}>
                            <TableCell className="line-clamp-1 font-medium">{r.rubro}</TableCell>
                            <TableCell className="cifra text-right">{formatCurrency(r.total)}</TableCell>
                            <TableCell className="cifra text-right text-xs">
                              {r.margenPct !== undefined ? (
                                <span className={r.margenPct < 0 ? "font-medium text-destructive" : "text-money"}>
                                  {formatCurrency(r.margen)} ({r.margenPct.toFixed(0)}%)
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
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

            <div className="space-y-4">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-primary" /> Gastos por categoría</CardTitle>
                </CardHeader>
                <CardContent>
                  {(reporte?.gastosPorCategoria.length ?? 0) === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sin gastos en el periodo</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Categoría</TableHead>
                          <TableHead className="text-right">Cant.</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reporte?.gastosPorCategoria.map((g) => (
                          <TableRow key={g.categoria || "sin"}>
                            <TableCell className="font-medium">{g.label}</TableCell>
                            <TableCell className="cifra text-right text-muted-foreground">{g.cantidad}</TableCell>
                            <TableCell className="cifra text-right font-semibold">{formatCurrency(g.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><PackageX className="h-4 w-4 text-destructive" /> Pérdidas (mermas y faltantes)</CardTitle>
                </CardHeader>
                <CardContent>
                  {(reporte?.perdidas.porCausa.length ?? 0) === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sin pérdidas registradas. Las mermas se cargan desde Editar producto → Ajustar stock → Merma.</p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Causa</TableHead>
                            <TableHead className="text-right">Unidades</TableHead>
                            <TableHead className="text-right">A costo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reporte?.perdidas.porCausa.map((p) => (
                            <TableRow key={p.causa}>
                              <TableCell className="font-medium">{p.label}</TableCell>
                              <TableCell className="cifra text-right text-muted-foreground">{p.unidades}</TableCell>
                              <TableCell className="cifra text-right font-semibold text-destructive">{formatCurrency(p.valor)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {(reporte?.perdidas.sinCosto ?? 0) > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">{reporte?.perdidas.sinCosto} unidades perdidas sin costo cargado: no se pudieron valorizar.</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpRight className="h-4 w-4 text-warning" /> Mayores aumentos de precio (últimos 30 días)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aumentos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin cambios de precio registrados</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Antes</TableHead>
                        <TableHead className="text-right">Ahora</TableHead>
                        <TableHead className="text-right">Aumento</TableHead>
                        <TableHead>Origen</TableHead>
                        <TableHead>Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aumentos.map((a, i) => (
                        <TableRow key={`${a.productoId}-${i}`}>
                          <TableCell className="line-clamp-1 font-medium">{a.nombre}</TableCell>
                          <TableCell className="cifra text-right text-muted-foreground">{formatCurrency(a.precioAnterior)}</TableCell>
                          <TableCell className="cifra text-right">{formatCurrency(a.precioNuevo)}</TableCell>
                          <TableCell className="cifra text-right font-semibold text-warning">+{a.variacionPct.toFixed(0)}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.usuarioNombre ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(a.fecha)}</TableCell>
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
    </AppShell>
  );
}

function Kpi({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={cn("rounded-2xl", highlight && "card-premium border-0")}>
      <CardContent className="p-4">
        <div className="eyebrow flex items-center gap-1.5">{icon}{label}</div>
        <p className={highlight ? "cifra-hero text-money mt-1.5 text-4xl" : "cifra mt-1 text-2xl font-bold"}>{value}</p>
      </CardContent>
    </Card>
  );
}
