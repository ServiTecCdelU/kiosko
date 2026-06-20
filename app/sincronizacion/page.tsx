"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { RefreshCw, Package, ArrowLeft, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getSyncLogs, getProductosCount } from "@/services/sync-log-service";
import type { SyncLog, SyncEstado } from "@/lib/types";
import { formatDateTime } from "@/lib/utils/format";
import type { SyncResult } from "@/services/sync-service";
import { AuthGuard } from "@/components/auth/auth-guard";

function estadoBadge(estado: SyncEstado) {
  if (estado === "ok") {
    return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="mr-1 h-3 w-3" />OK</Badge>;
  }
  if (estado === "parcial") {
    return <Badge className="bg-warning text-warning-foreground"><AlertTriangle className="mr-1 h-3 w-3" />Parcial</Badge>;
  }
  return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Error</Badge>;
}

export default function SincronizacionPage() {
  return (
    <AuthGuard>
      <SincronizacionContent />
    </AuthGuard>
  );
}

function SincronizacionContent() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, c] = await Promise.all([getSyncLogs(20), getProductosCount()]);
      setLogs(l);
      setCount(c);
    } catch {
      toast.error("No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    toast.loading("Sincronizando catalogo...", { id: "sync" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data: SyncResult = await res.json();
      if (data.estado === "error") {
        toast.error(data.error ?? "Error de sincronizacion", { id: "sync" });
      } else {
        toast.success(
          `${data.productosCreados} nuevos · ${data.productosActualizados} actualizados`,
          { id: "sync" },
        );
      }
      await load();
    } catch {
      toast.error("No se pudo sincronizar", { id: "sync" });
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const ultima = logs[0];

  return (
    <main className="bg-mesh min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rounded-2xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold sm:text-2xl">Sincronizacion</h1>
          <p className="text-sm text-muted-foreground">Catalogo desde la distribuidora</p>
        </div>
        <Button onClick={handleSync} disabled={syncing} className="rounded-2xl">
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando" : "Sincronizar ahora"}
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" /> Productos en el kiosko
            </CardTitle>
          </CardHeader>
          <CardContent>
            {count === null ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <span className="cifra-hero text-4xl text-primary">{count.toLocaleString("es-AR")}</span>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ultima sincronizacion</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-40" />
            ) : ultima ? (
              <div className="flex items-center gap-2">
                {estadoBadge(ultima.estado)}
                <span className="text-sm text-muted-foreground">{formatDateTime(ultima.startedAt)}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Nunca</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin sincronizaciones aun</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Nuevos</TableHead>
                  <TableHead className="text-right">Actualizados</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(log.startedAt)}</TableCell>
                    <TableCell>{estadoBadge(log.estado)}</TableCell>
                    <TableCell className="text-right">{log.productosCreados}</TableCell>
                    <TableCell className="text-right">{log.productosActualizados}</TableCell>
                    <TableCell className="text-right font-medium">{log.productosTotal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {ultima?.error && (
        <p className="mt-3 text-sm text-destructive">Ultimo error: {ultima.error}</p>
      )}
    </div></main>
  );
}
