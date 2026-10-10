"use client";

// /stock/inventario — recuento fisico de stock (solo admin).
// Se abre un recuento (todo o un rubro), se cuenta con el lector o buscando,
// y al cerrar el sistema ajusta el stock de lo contado.
// Spec: docs/superpowers/specs/2026-10-10-inventario-y-mermas-design.md
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, ClipboardCheck, History, Loader2, Play, Search, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarcodeScannerDialog } from "@/components/pos/barcode-scanner-dialog";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { getCurrentUser } from "@/hooks/use-auth";
import { getCategorias, findProductByCode } from "@/services/products-service";
import {
  abrirInventario, cancelarInventario, cerrarInventario, contarProducto, getHistorialInventarios,
  getInventarioDetalle, getInventariosAbiertos, type Inventario, type ItemInventarioCerrado,
} from "@/services/inventario-service";
import { buscarEnInventario, diferenciaItem, ordenarParaContar, progresoInventario, resumenDiferencias } from "@/lib/inventario";

export default function InventarioPage() {
  const [abiertos, setAbiertos] = useState<Inventario[] | null>(null);
  const [historial, setHistorial] = useState<Inventario[]>([]);
  const [actual, setActual] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoria, setCategoria] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [verCerrado, setVerCerrado] = useState<Inventario | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([getInventariosAbiertos(), getHistorialInventarios()]);
      setAbiertos(a);
      setHistorial(h);
      setActual((prev) => prev && a.some((x) => x.id === prev) ? prev : a[0]?.id ?? null);
    } catch {
      toast.error("No se pudieron cargar los recuentos");
      setAbiertos([]);
    }
  }, []);

  useEffect(() => {
    cargar();
    getCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, [cargar]);

  const abrir = async () => {
    setAbriendo(true);
    try {
      const u = getCurrentUser();
      const r = await abrirInventario({ categoria: categoria || undefined, usuarioId: u?.id, usuarioNombre: u?.nombre });
      toast.success(`Recuento abierto con ${r.productos} productos`);
      await cargar();
      setActual(r.inventarioId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el recuento");
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <AppShell title="Recuento de stock">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="rounded-2xl" asChild>
          <Link href="/stock"><ArrowLeft className="mr-2 h-4 w-4" /> Volver a Stock</Link>
        </Button>
        {abiertos && abiertos.length > 1 && (
          <div className="inline-flex rounded-2xl border bg-card p-1">
            {abiertos.map((i) => (
              <button
                key={i.id}
                onClick={() => setActual(i.id)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                  actual === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {i.categoria ?? "Todo el catálogo"}
              </button>
            ))}
          </div>
        )}
      </div>

      {abiertos === null ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="space-y-4">
          {actual ? (
            <Recuento inventarioId={actual} onCerrado={cargar} />
          ) : (
            <Card className="card-premium rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-4 w-4 text-primary" /> Nuevo recuento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Se toma una foto del stock de hoy. Contás góndola por góndola (podés parar y seguir otro día) y al cerrar
                  el sistema ajusta el stock de lo que contaste. Lo que no cuentes no se toca.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="border-input h-9 flex-1 rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none"
                  >
                    <option value="">Todo el catálogo</option>
                    {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button className="rounded-2xl" disabled={abriendo} onClick={abrir}>
                    {abriendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Empezar a contar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {actual && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="border-input h-9 rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none"
              >
                <option value="">Todo el catálogo</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button variant="outline" className="rounded-2xl" disabled={abriendo} onClick={abrir}>
                <Play className="mr-2 h-4 w-4" /> Abrir otro recuento
              </Button>
            </div>
          )}

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Recuentos anteriores</CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {historial.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground sm:px-0">Todavía no hay recuentos cerrados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Alcance</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Contados</TableHead>
                      <TableHead className="text-right">Con diferencia</TableHead>
                      <TableHead className="text-right">Diferencia a costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historial.map((i) => (
                      <TableRow key={i.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setVerCerrado(i)}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDateTime(i.cerradoAt ?? i.createdAt)}</TableCell>
                        <TableCell>{i.categoria ?? "Todo"}</TableCell>
                        <TableCell><Badge variant="outline" className={cn(i.estado === "cancelado" && "border-destructive/50 text-destructive")}>{i.estado}</Badge></TableCell>
                        <TableCell className="cifra text-right">{i.contados} / {i.productos}</TableCell>
                        <TableCell className="cifra text-right">{i.conDiferencia}</TableCell>
                        <TableCell className={cn("cifra text-right font-semibold", i.diferenciaValor < 0 ? "text-destructive" : "text-money")}>
                          {formatCurrency(i.diferenciaValor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <DetalleCerradoDialog inventario={verCerrado} onOpenChange={(o) => !o && setVerCerrado(null)} />
    </AppShell>
  );
}

// ── Recuento abierto ──────────────────────────────────────────

function Recuento({ inventarioId, onCerrado }: { inventarioId: string; onCerrado: () => Promise<void> }) {
  const [inventario, setInventario] = useState<Inventario | null>(null);
  const [items, setItems] = useState<ItemInventarioCerrado[]>([]);
  const [texto, setTexto] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [enfocado, setEnfocado] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const cantidadRef = useRef<HTMLInputElement>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await getInventarioDetalle(inventarioId);
      setInventario(d.inventario);
      setItems(d.items);
    } catch {
      toast.error("No se pudo cargar el recuento");
    }
  }, [inventarioId]);

  useEffect(() => {
    setInventario(null);
    setEnfocado(null);
    setTexto("");
    cargar();
  }, [cargar]);

  const progreso = useMemo(() => progresoInventario(items), [items]);
  const resumen = useMemo(() => resumenDiferencias(items), [items]);
  const visibles = useMemo(() => ordenarParaContar(buscarEnInventario(items, texto, 60)), [items, texto]);
  const itemEnfocado = enfocado ? items.find((i) => i.productoId === enfocado) : undefined;

  const enfocar = (productoId: string) => {
    const it = items.find((i) => i.productoId === productoId);
    setEnfocado(productoId);
    setCantidad(it?.contado != null ? String(it.contado) : "");
    setTimeout(() => cantidadRef.current?.focus(), 50);
  };

  const guardar = async () => {
    if (!enfocado || cantidad === "") return;
    const n = Number(cantidad);
    if (!Number.isFinite(n) || n < 0) return;
    setGuardando(true);
    try {
      const r = await contarProducto({ inventarioId, productoId: enfocado, contado: n, usuario: getCurrentUser()?.nombre });
      setItems((prev) => {
        const existe = prev.some((i) => i.productoId === r.productoId);
        if (existe) return prev.map((i) => (i.productoId === r.productoId ? { ...i, contado: r.contado } : i));
        return [...prev, { productoId: r.productoId, nombre: r.nombre, stockSistema: r.stockSistema, contado: r.contado }];
      });
      setEnfocado(null);
      setCantidad("");
      setTexto("");
      setTimeout(() => buscadorRef.current?.focus(), 50);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el conteo");
    } finally {
      setGuardando(false);
    }
  };

  // Codigo escaneado o tipeado + Enter: si esta en el recuento se enfoca; si no, se busca en el catalogo.
  const procesarCodigo = async (codigo: string) => {
    const c = codigo.trim();
    if (!c) return;
    const enLista = items.find((i) => i.codigoBarras && i.codigoBarras.toLowerCase() === c.toLowerCase());
    if (enLista) {
      enfocar(enLista.productoId);
      return;
    }
    try {
      const p = await findProductByCode(c);
      if (!p) {
        toast.error(`No hay ningún producto con el código ${c}`);
        return;
      }
      setItems((prev) => prev.some((i) => i.productoId === p.id)
        ? prev
        : [...prev, { productoId: p.id, nombre: p.name, codigoBarras: p.codigoBarras, categoria: p.category, stockSistema: p.stock, costo: p.precioBase }]);
      enfocar(p.id);
    } catch {
      toast.error("No se pudo buscar el código");
    }
  };

  const cerrar = async () => {
    setCerrando(true);
    try {
      const u = getCurrentUser();
      const r = await cerrarInventario({ inventarioId, usuarioId: u?.id, usuarioNombre: u?.nombre });
      toast.success(`Recuento cerrado: ${r.contados} contados, ${r.conDiferencia} ajustados (${formatCurrency(r.diferenciaValor)} a costo)`);
      setCerrarOpen(false);
      await onCerrado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar el recuento");
    } finally {
      setCerrando(false);
    }
  };

  const cancelar = async () => {
    if (!window.confirm("¿Cancelar este recuento? No se ajusta ningún stock y se pierde lo contado.")) return;
    try {
      await cancelarInventario(inventarioId);
      toast.success("Recuento cancelado");
      await onCerrado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar");
    }
  };

  if (!inventario) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div className="space-y-3">
      <Card className="card-premium rounded-2xl">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="eyebrow">Recuento abierto · {inventario.categoria ?? "Todo el catálogo"} · {formatDateTime(inventario.createdAt)}</p>
            <p className="cifra mt-1 text-2xl font-bold">
              {progreso.contados} <span className="text-base font-normal text-muted-foreground">de {progreso.total} contados ({progreso.porcentaje}%)</span>
            </p>
            {resumen.conDiferencia > 0 && (
              <p className="text-xs text-muted-foreground">
                {resumen.faltantes} faltante(s) · {resumen.sobrantes} sobrante(s) · diferencia a costo{" "}
                <b className={resumen.valor < 0 ? "text-destructive" : "text-money"}>{formatCurrency(resumen.valor)}</b>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-2xl text-muted-foreground" onClick={cancelar}><X className="mr-1.5 h-4 w-4" /> Cancelar</Button>
            <Button className="rounded-2xl" disabled={progreso.contados === 0} onClick={() => setCerrarOpen(true)}>
              <Check className="mr-1.5 h-4 w-4" /> Cerrar y ajustar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={buscadorRef}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                procesarCodigo(texto);
              }
            }}
            placeholder="Escaneá el código o buscá por nombre…"
            className="rounded-xl pl-9"
          />
        </div>
        <Button variant="outline" className="rounded-xl md:hidden" onClick={() => setScannerOpen(true)} title="Escanear con la cámara">
          <Camera className="h-4 w-4" />
        </Button>
      </div>

      {itemEnfocado && (
        <Card className="rounded-2xl border-primary">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{itemEnfocado.nombre}</p>
              <p className="text-xs text-muted-foreground">
                Sistema: {itemEnfocado.stockSistema}{itemEnfocado.contado != null && ` · ya contado: ${itemEnfocado.contado}`}
              </p>
            </div>
            <Input
              ref={cantidadRef}
              type="number" inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
                if (e.key === "Escape") setEnfocado(null);
              }}
              placeholder="Cantidad en góndola"
              className="w-40 rounded-xl text-lg"
            />
            <Button className="rounded-xl" disabled={guardando || cantidad === ""} onClick={guardar}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
            <Button variant="ghost" className="rounded-xl" onClick={() => setEnfocado(null)}>Cancelar</Button>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardContent className="px-0 sm:px-6">
          {visibles.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">Sin productos para mostrar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((i) => {
                  const d = diferenciaItem(i);
                  return (
                    <TableRow key={i.productoId} className="cursor-pointer hover:bg-muted/50" onClick={() => enfocar(i.productoId)}>
                      <TableCell>
                        <p className="font-medium">{i.nombre}</p>
                        {i.codigoBarras && <p className="text-xs text-muted-foreground">{i.codigoBarras}</p>}
                      </TableCell>
                      <TableCell className="cifra text-right text-muted-foreground">{i.stockSistema}</TableCell>
                      <TableCell className="cifra text-right font-semibold">{i.contado ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className={cn("cifra text-right", d == null ? "text-muted-foreground" : d < 0 ? "font-semibold text-destructive" : d > 0 ? "font-semibold text-money" : "")}>
                        {d == null ? "sin contar" : d === 0 ? "ok" : d > 0 ? `+${d}` : d}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {texto === "" && items.length > visibles.length && (
            <p className="px-6 py-3 text-xs text-muted-foreground sm:px-0">Se muestran {visibles.length} de {items.length}. Buscá o escaneá para encontrar el resto.</p>
          )}
        </CardContent>
      </Card>

      <BarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onDetected={(c) => { setScannerOpen(false); procesarCodigo(c); }} />

      <Dialog open={cerrarOpen} onOpenChange={setCerrarOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar el recuento</DialogTitle>
            <DialogDescription>
              Se ajusta el stock de los {progreso.contados} productos contados al valor que contaste. Los {progreso.pendientes} sin contar quedan como están.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p>Con diferencia: <b>{resumen.conDiferencia}</b> ({resumen.faltantes} faltan, {resumen.sobrantes} sobran)</p>
            <p>Diferencia a costo: <b className={resumen.valor < 0 ? "text-destructive" : "text-money"}>{formatCurrency(resumen.valor)}</b>
              {resumen.sinCosto > 0 && <span className="text-muted-foreground"> · {resumen.sinCosto} sin costo cargado</span>}
            </p>
            <p className="text-xs text-muted-foreground">La diferencia se calcula contra el stock real del momento del cierre, por si hubo ventas mientras contabas.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCerrarOpen(false)}>Seguir contando</Button>
            <Button className="rounded-xl" disabled={cerrando} onClick={cerrar}>
              {cerrando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Cerrar y ajustar stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Detalle de un recuento cerrado ────────────────────────────

function DetalleCerradoDialog({ inventario, onOpenChange }: { inventario: Inventario | null; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<ItemInventarioCerrado[] | null>(null);

  useEffect(() => {
    if (!inventario) return;
    setItems(null);
    getInventarioDetalle(inventario.id).then((d) => setItems(d.items)).catch(() => setItems([]));
  }, [inventario]);

  const conDiferencia = (items ?? []).filter((i) => i.diferencia != null && i.diferencia !== 0);

  return (
    <Dialog open={!!inventario} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        {inventario && (
          <>
            <DialogHeader>
              <DialogTitle>Recuento · {inventario.categoria ?? "Todo"} · {formatDateTime(inventario.cerradoAt ?? inventario.createdAt)}</DialogTitle>
              <DialogDescription>
                {inventario.contados} contados · {inventario.conDiferencia} con diferencia · {formatCurrency(inventario.diferenciaValor)} a costo
                {inventario.usuarioNombre && ` · ${inventario.usuarioNombre}`}
              </DialogDescription>
            </DialogHeader>
            {items === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : conDiferencia.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin diferencias: el stock coincidía con lo contado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Había</TableHead>
                    <TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Dif.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conDiferencia.map((i) => (
                    <TableRow key={i.productoId}>
                      <TableCell className="font-medium">{i.nombre}</TableCell>
                      <TableCell className="cifra text-right text-muted-foreground">{i.stockAlCerrar}</TableCell>
                      <TableCell className="cifra text-right">{i.contado}</TableCell>
                      <TableCell className={cn("cifra text-right font-semibold", (i.diferencia ?? 0) < 0 ? "text-destructive" : "text-money")}>
                        {(i.diferencia ?? 0) > 0 ? `+${i.diferencia}` : i.diferencia}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
