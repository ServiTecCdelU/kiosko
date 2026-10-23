"use client";

// /distribuidora — stock compartido con la distribuidora (solo el comercio vinculado).
// Los productos son los mismos (catalogo sincronizado) y cada lado tiene su stock:
// aca se ven los dos y se mueve de uno al otro. Solo stock: precios y ventas no se tocan.
// Spec: docs/superpowers/specs/2026-10-23-stock-distribuidora-design.md
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";
import {
  cantidadTransferible, estaAbierta, filtrarFilas, textoDireccion,
  type DireccionTransferencia, type FilaStock, type Transferencia,
} from "@/lib/stock-distribuidora";
import { getStockCompartido, reintentarTransferencias, transferirStock, type StockCompartido } from "@/services/distribuidora-service";

/** Filas que se dibujan a la vez: con miles de productos se busca. */
const FILAS_VISIBLES = 100;

const ESTADO: Record<Transferencia["estado"], { texto: string; clase: string }> = {
  completa: { texto: "Hecha", clase: "bg-emerald-100 text-emerald-800" },
  fallida: { texto: "No se hizo", clase: "bg-red-100 text-red-800" },
  pendiente: { texto: "A medio camino", clase: "bg-amber-100 text-amber-800" },
  origen_ok: { texto: "A medio camino", clase: "bg-amber-100 text-amber-800" },
};

export default function DistribuidoraPage() {
  const [datos, setDatos] = useState<StockCompartido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await getStockCompartido());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el stock");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(() => filtrarFilas(datos?.productos ?? [], busqueda), [datos, busqueda]);
  const abiertas = (datos?.transferencias ?? []).filter((t) => estaAbierta(t.estado));

  const mover = async (fila: FilaStock, direccion: DireccionTransferencia) => {
    const cantidad = cantidadTransferible(cantidades[fila.productoId] ?? "1");
    if (!cantidad) {
      toast.error("Poné una cantidad entera mayor a 0");
      return;
    }
    const disponible = direccion === "a_comercio" ? fila.stockDistribuidora : fila.stockComercio;
    if (disponible !== null && cantidad > disponible) {
      toast.error(`No alcanza: ${direccion === "a_comercio" ? "la distribuidora" : "el super"} tiene ${disponible}`);
      return;
    }
    setMoviendo(fila.productoId);
    try {
      const t = await transferirStock(fila.productoId, cantidad, direccion);
      if (t.estado === "completa") {
        toast.success(`${cantidad} × ${fila.nombre} · ${textoDireccion(direccion)}`);
        setCantidades((c) => ({ ...c, [fila.productoId]: "" }));
      } else if (t.estado === "fallida") {
        toast.error(t.error ?? "No se pudo mover el stock");
      } else {
        toast.warning("Quedó a medio camino: tocá “Reintentar” arriba.", { description: t.error ?? undefined });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover el stock");
    } finally {
      setMoviendo(null);
      await cargar();
    }
  };

  const reintentar = async () => {
    setReintentando(true);
    try {
      const r = await reintentarTransferencias();
      const pendientes = r.filter((t) => estaAbierta(t.estado)).length;
      if (pendientes === 0) toast.success("Listo: se completaron");
      else toast.warning(`Quedan ${pendientes} sin completar`, { description: r.find((t) => t.error)?.error ?? undefined });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reintentar");
    } finally {
      setReintentando(false);
      await cargar();
    }
  };

  return (
    <AppShell title="Distribuidora">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Los productos son los mismos, pero cada uno tiene su stock. Poné la cantidad y elegí para qué lado se mueve.
        </p>

        {abiertas.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {abiertas.length === 1 ? "Hay 1 movimiento" : `Hay ${abiertas.length} movimientos`} a medio camino (se cortó la conexión).
              Reintentar lo termina sin descontar dos veces.
            </p>
            <Button size="sm" className="rounded-xl" disabled={reintentando} onClick={() => void reintentar()}>
              {reintentando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Reintentar
            </Button>
          </div>
        )}

        {datos?.errorDistribuidora && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            No se pudo leer el stock de la distribuidora ({datos.errorDistribuidora}). Se ve solo el del super.
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código" className="rounded-2xl pl-9" />
          </div>
          <Button variant="outline" className="rounded-2xl" onClick={() => void cargar()} aria-label="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!datos && !error ? (
          <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
        ) : datos && (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Super</TableHead>
                  <TableHead className="text-right">Distribuidora</TableHead>
                  <TableHead className="w-24">Cantidad</TableHead>
                  <TableHead className="text-right">Mover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, FILAS_VISIBLES).map((f) => {
                  const ocupado = moviendo === f.productoId;
                  return (
                    <TableRow key={f.productoId}>
                      <TableCell>
                        <p className="font-medium">{f.nombre}</p>
                        {f.codigo && <p className="text-xs text-muted-foreground">{f.codigo}</p>}
                      </TableCell>
                      <TableCell className={cn("text-right text-base font-semibold tabular-nums", f.stockComercio <= 0 && "text-red-600")}>
                        {f.stockComercio}
                      </TableCell>
                      <TableCell className={cn("text-right text-base font-semibold tabular-nums", (f.stockDistribuidora ?? 0) <= 0 && "text-red-600")}>
                        {f.stockDistribuidora ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          value={cantidades[f.productoId] ?? ""}
                          placeholder="1"
                          onChange={(e) => setCantidades((c) => ({ ...c, [f.productoId]: e.target.value.replace(/[^\d]/g, "") }))}
                          className="h-9 w-20 rounded-xl text-right"
                          aria-label={`Cantidad de ${f.nombre}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={ocupado || f.stockDistribuidora === null || f.stockDistribuidora <= 0}
                            onClick={() => void mover(f, "a_comercio")}
                            title="Traer de la distribuidora al super"
                          >
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="mr-1 h-3.5 w-3.5" />} Al super
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={ocupado || f.stockDistribuidora === null || f.stockComercio <= 0}
                            onClick={() => void mover(f, "a_distribuidora")}
                            title="Devolver del super a la distribuidora"
                          >
                            A la distri <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {datos.productos.length === 0 ? "No hay productos de la distribuidora: sincronizá el catálogo primero." : "Nada coincide con la búsqueda."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {filtradas.length > FILAS_VISIBLES && (
              <p className="border-t p-3 text-center text-xs text-muted-foreground">
                Mostrando {FILAS_VISIBLES} de {filtradas.length}. Buscá para encontrar el resto.
              </p>
            )}
          </div>
        )}

        {datos && datos.transferencias.length > 0 && (
          <section className="space-y-2 rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Últimos movimientos</h2>
            <ul className="divide-y text-sm">
              {datos.transferencias.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.cantidad} × {t.nombre ?? t.productoId}</p>
                    <p className="text-xs text-muted-foreground">
                      {textoDireccion(t.direccion)} · {formatDateTime(new Date(t.createdAt))}
                      {t.usuario ? ` · ${t.usuario}` : ""}
                      {t.pedidaEn === "distribuidora" ? " · desde la distribuidora" : ""}
                    </p>
                    {t.error && t.estado !== "completa" && <p className="text-xs text-red-600">{t.error}</p>}
                  </div>
                  <Badge className={cn("rounded-xl", ESTADO[t.estado].clase)}>{ESTADO[t.estado].texto}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
