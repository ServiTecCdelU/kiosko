"use client";

// /distribuidora — stock compartido con la distribuidora (solo el comercio vinculado).
// Los productos son los de la distribuidora y cada lado tiene su stock: aca se ven los
// dos y se mueve de uno al otro, de a uno o varios de una ("10 de cada uno" o "todo").
// Lo que el super no tiene se da de alta solo al pasarle stock. Solo stock: precios y
// ventas no se tocan. Spec: docs/superpowers/specs/2026-10-23-stock-distribuidora-design.md
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";
import {
  armarLote, conStock, disponibleParaMover, estaAbierta, filtrarFilas, textoDireccion,
  type DireccionTransferencia, type FilaStock, type Transferencia,
} from "@/lib/stock-distribuidora";
import {
  getStockCompartido, reintentarTransferencias, transferirStock, transferirVarios, type StockCompartido,
} from "@/services/distribuidora-service";

/** Filas que se dibujan a la vez: con miles de productos se busca. */
const FILAS_VISIBLES = 100;
/** Productos por pedido al pasar varios: se ve el avance y ningun pedido se hace eterno. */
const TANDA = 20;

const ESTADO: Record<Transferencia["estado"], { texto: string; clase: string }> = {
  completa: { texto: "Hecha", clase: "bg-emerald-100 text-emerald-800" },
  fallida: { texto: "No se hizo", clase: "bg-red-100 text-red-800" },
  pendiente: { texto: "A medio camino", clase: "bg-amber-100 text-amber-800" },
  origen_ok: { texto: "A medio camino", clase: "bg-amber-100 text-amber-800" },
};

const NOMBRE_LADO: Record<DireccionTransferencia, string> = { a_comercio: "la distribuidora", a_distribuidora: "el super" };

export default function DistribuidoraPage() {
  const [datos, setDatos] = useState<StockCompartido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloConStock, setSoloConStock] = useState(true);
  /** Por fila: un numero o "todo". Vacio = 1. */
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [cantidadLote, setCantidadLote] = useState("10");
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
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

  const filtradas = useMemo(() => {
    const base = soloConStock ? conStock(datos?.productos ?? []) : datos?.productos ?? [];
    return filtrarFilas(base, busqueda);
  }, [datos, busqueda, soloConStock]);
  const visibles = filtradas.slice(0, FILAS_VISIBLES);
  const abiertas = (datos?.transferencias ?? []).filter((t) => estaAbierta(t.estado));
  const ocupado = moviendo !== null || progreso !== null;
  const todosElegidos = filtradas.length > 0 && filtradas.every((f) => elegidos.has(f.distId));

  const alternar = (distId: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(distId)) n.delete(distId);
      else n.add(distId);
      return n;
    });

  const alternarTodos = () => setElegidos(todosElegidos ? new Set() : new Set(filtradas.map((f) => f.distId)));

  const mover = async (fila: FilaStock, direccion: DireccionTransferencia) => {
    const pedido = (cantidades[fila.distId] ?? "").trim() || "1";
    const hay = disponibleParaMover(fila, direccion);
    const cantidad = pedido === "todo" ? hay : Number(pedido);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      toast.error(pedido === "todo" ? `No hay stock en ${NOMBRE_LADO[direccion]}` : "Poné una cantidad entera mayor a 0");
      return;
    }
    if (cantidad > hay) {
      toast.error(`No alcanza: ${NOMBRE_LADO[direccion]} tiene ${hay}`);
      return;
    }
    setMoviendo(fila.distId);
    try {
      const t = await transferirStock(fila.distId, cantidad, direccion);
      if (t.estado === "completa") {
        toast.success(`${cantidad} × ${fila.nombre} · ${textoDireccion(direccion)}`);
        setCantidades((c) => ({ ...c, [fila.distId]: "" }));
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

  const moverElegidos = async (direccion: DireccionTransferencia) => {
    const cantidad = cantidadLote === "todo" ? "todo" : Number(cantidadLote);
    if (cantidad !== "todo" && (!Number.isInteger(cantidad) || cantidad <= 0)) {
      toast.error("Poné una cantidad entera mayor a 0 o elegí “Todo”");
      return;
    }
    const filas = (datos?.productos ?? []).filter((f) => elegidos.has(f.distId));
    const lote = armarLote(filas, direccion, cantidad);
    if (lote.length === 0) {
      toast.error(`Ninguno de los elegidos tiene stock en ${NOMBRE_LADO[direccion]}`);
      return;
    }
    let bien = 0;
    const errores: string[] = [];
    setProgreso({ hechos: 0, total: lote.length });
    try {
      for (let i = 0; i < lote.length; i += TANDA) {
        const resultados = await transferirVarios(lote.slice(i, i + TANDA), direccion);
        for (const r of resultados) {
          if (r.transferencia?.estado === "completa") bien++;
          else errores.push(r.error ?? r.transferencia?.error ?? "quedó a medio camino");
        }
        setProgreso({ hechos: Math.min(i + TANDA, lote.length), total: lote.length });
      }
    } catch (e) {
      errores.push(e instanceof Error ? e.message : "No se pudo mover el stock");
    } finally {
      setProgreso(null);
      setElegidos(new Set());
      await cargar();
    }
    const salteados = filas.length - lote.length;
    if (errores.length === 0) {
      toast.success(`${bien} ${bien === 1 ? "producto pasado" : "productos pasados"} · ${textoDireccion(direccion)}`, {
        description: salteados > 0 ? `${salteados} sin stock en ${NOMBRE_LADO[direccion]}: no se tocaron.` : undefined,
      });
    } else {
      toast.warning(`${bien} pasados, ${errores.length} con problema`, { description: errores[0] });
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
          Los productos son los de la distribuidora y cada uno tiene su stock. Pasá de a uno con los botones de cada
          fila, o tildá varios y pasalos de una.
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código" className="rounded-2xl pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={soloConStock} onCheckedChange={setSoloConStock} /> Solo con stock
          </label>
          <Button variant="outline" className="rounded-2xl" onClick={() => void cargar()} aria-label="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {elegidos.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-2xl border border-primary/40 bg-card p-4 shadow-sm sm:flex-row sm:items-center">
            <p className="text-sm font-medium">{elegidos.size} {elegidos.size === 1 ? "elegido" : "elegidos"}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Pasar</span>
              <Input
                inputMode="numeric"
                value={cantidadLote === "todo" ? "" : cantidadLote}
                placeholder={cantidadLote === "todo" ? "todo" : "10"}
                onChange={(e) => setCantidadLote(e.target.value.replace(/[^\d]/g, ""))}
                className="h-9 w-20 rounded-xl text-right"
                aria-label="Cantidad de cada uno"
              />
              <span className="text-sm text-muted-foreground">de cada uno, o</span>
              <Button
                size="sm"
                variant={cantidadLote === "todo" ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => setCantidadLote(cantidadLote === "todo" ? "10" : "todo")}
              >
                Todo el stock
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" className="rounded-xl" disabled={ocupado} onClick={() => void moverElegidos("a_comercio")}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Al super
              </Button>
              <Button size="sm" className="rounded-xl" disabled={ocupado} onClick={() => void moverElegidos("a_distribuidora")}>
                A la distri <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="rounded-xl" disabled={ocupado} onClick={() => setElegidos(new Set())}>
                Cancelar
              </Button>
            </div>
            {progreso && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {progreso.hechos} de {progreso.total}…
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!datos && !error ? (
          <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
        ) : datos && (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={todosElegidos}
                      onChange={alternarTodos}
                      aria-label="Elegir todos los de la lista"
                      title={`Elegir los ${filtradas.length} de la lista`}
                    />
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Super</TableHead>
                  <TableHead className="text-right">Distribuidora</TableHead>
                  <TableHead className="w-36">Cantidad</TableHead>
                  <TableHead className="text-right">Mover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((f) => {
                  const enCurso = moviendo === f.distId;
                  const valor = cantidades[f.distId] ?? "";
                  return (
                    <TableRow key={f.distId} className={cn(elegidos.has(f.distId) && "bg-primary/5")}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={elegidos.has(f.distId)}
                          onChange={() => alternar(f.distId)}
                          aria-label={`Elegir ${f.nombre}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{f.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.codigo}
                          {!f.productoId && <span className="ml-1">· todavía no está en el super</span>}
                        </p>
                      </TableCell>
                      <TableCell className={cn("text-right text-base font-semibold tabular-nums", f.stockComercio <= 0 && "text-red-600")}>
                        {f.stockComercio}
                      </TableCell>
                      <TableCell className={cn("text-right text-base font-semibold tabular-nums", (f.stockDistribuidora ?? 0) <= 0 && "text-red-600")}>
                        {f.stockDistribuidora ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="numeric"
                            value={valor === "todo" ? "" : valor}
                            placeholder={valor === "todo" ? "todo" : "1"}
                            onChange={(e) => setCantidades((c) => ({ ...c, [f.distId]: e.target.value.replace(/[^\d]/g, "") }))}
                            className="h-9 w-16 rounded-xl text-right"
                            aria-label={`Cantidad de ${f.nombre}`}
                          />
                          <Button
                            size="sm"
                            variant={valor === "todo" ? "default" : "ghost"}
                            className="h-9 rounded-xl px-2 text-xs"
                            onClick={() => setCantidades((c) => ({ ...c, [f.distId]: valor === "todo" ? "" : "todo" }))}
                            title="Pasar todo el stock del lado de donde sale"
                          >
                            Todo
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={ocupado || (f.stockDistribuidora ?? 0) <= 0}
                            onClick={() => void mover(f, "a_comercio")}
                            title="Traer de la distribuidora al super"
                          >
                            {enCurso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="mr-1 h-3.5 w-3.5" />} Al super
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={ocupado || f.stockDistribuidora === null || f.stockComercio < 1}
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
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {busqueda.trim()
                        ? "Nada coincide con la búsqueda."
                        : soloConStock
                          ? "Ningún producto tiene stock. Apagá “Solo con stock” para ver todos."
                          : "La distribuidora no tiene productos."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {filtradas.length > FILAS_VISIBLES && (
              <p className="border-t p-3 text-center text-xs text-muted-foreground">
                Mostrando {FILAS_VISIBLES} de {filtradas.length}. Buscá para encontrar el resto (el tilde de arriba elige los {filtradas.length}).
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
                    <p className="truncate font-medium">{t.cantidad} × {t.nombre ?? t.distId}</p>
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
