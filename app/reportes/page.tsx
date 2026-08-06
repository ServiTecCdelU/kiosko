"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, Receipt, Banknote, CreditCard, Coins, PiggyBank } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { getReporte, type Reporte } from "@/services/reportes-service";

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

export default function ReportesPage() {
  const [rango, setRango] = useState<Rango>("hoy");
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: Rango) => {
    setLoading(true);
    try {
      const { desde, hasta } = rangoFechas(r);
      setReporte(await getReporte(desde, hasta));
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
            <Kpi label="Transferencia" value={formatCurrency(r?.transferencia ?? 0)} icon={<CreditCard className="h-4 w-4" />} />
            <Kpi label="Fiado" value={formatCurrency(r?.fiado ?? 0)} icon={<Coins className="h-4 w-4" />} />
            <Kpi
              label="Margen bruto"
              value={r ? `${formatCurrency(r.margenBruto)} (${r.margenPct.toFixed(0)}%)` : "—"}
              icon={<PiggyBank className="h-4 w-4" />}
            />
            <Kpi label="Gastos" value={formatCurrency(r?.gastosTotal ?? 0)} icon={<Receipt className="h-4 w-4" />} />
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
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={48}
                        tickFormatter={(v) => new Intl.NumberFormat("es-AR", { notation: "compact" }).format(v)} />
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
                          <TableCell className="text-right font-semibold">{p.cantidad}</TableCell>
                          <TableCell className="text-right">{formatCurrency(p.total)}</TableCell>
                          <TableCell className="text-right text-xs">
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
                          <TableCell className="text-right">{formatCurrency(r.total)}</TableCell>
                          <TableCell className="text-right text-xs">
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
