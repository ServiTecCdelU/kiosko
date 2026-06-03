"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Wallet, LockOpen, Lock, TrendingUp, Banknote, CreditCard } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";
import { formatDateTime } from "@/lib/utils/format";
import {
  getCajaAbierta, getResumenCaja, abrirCaja, cerrarCaja, getCajaHistorial,
  type ResumenCaja,
} from "@/services/caja-service";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Caja } from "@/lib/types";

export default function CajaPage() {
  const [caja, setCaja] = useState<Caja | null>(null);
  const [resumen, setResumen] = useState<ResumenCaja | null>(null);
  const [historial, setHistorial] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [montoApertura, setMontoApertura] = useState("");
  const [montoCierre, setMontoCierre] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const abierta = await getCajaAbierta();
      setCaja(abierta);
      setResumen(abierta ? await getResumenCaja(abierta.id) : null);
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
      const user = getCurrentUser();
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
      const user = getCurrentUser();
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

  const esperadoEfectivo = caja && resumen ? caja.montoApertura + resumen.totalEfectivo : 0;

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

          <Card className="max-w-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" /> Cerrar caja
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Efectivo esperado en caja</span>
                <span className="font-semibold">{formatCurrency(esperadoEfectivo)}</span>
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
    </AppShell>
  );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <p className={highlight ? "cifra mt-1 text-3xl font-bold text-primary" : "cifra mt-1 text-2xl font-bold"}>{value}</p>
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
