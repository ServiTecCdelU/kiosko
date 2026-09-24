"use client";

// /compras — recepcion de mercaderia por proveedor, historial y CRUD de proveedores.
// Spec: docs/superpowers/specs/2026-09-18-proveedores-compras-design.md
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Truck, Search, Trash2, History, Users, Plus, Ban } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { totalCompra, margenPct } from "@/lib/compras";
import { searchProducts } from "@/services/products-service";
import {
  getProveedores, crearProveedor, actualizarProveedor, recibirCompra, anularCompra,
  getCompras, getCompraDetalle,
  type Proveedor, type Compra, type CompraItem, type CompraCondicion,
} from "@/services/compras-service";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Product } from "@/lib/types";

type Tab = "recepcion" | "historial" | "proveedores";

interface ItemCarrito {
  productoId: string;
  nombre: string;
  precioVenta: number;
  cantidad: string;       // texto del input, se valida al confirmar
  costoUnitario: string;
}

export default function ComprasPage() {
  const [tab, setTab] = useState<Tab>("recepcion");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProveedores(await getProveedores());
    } catch {
      toast.error("No se pudieron cargar los proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell title="Compras">
      <div className="mb-4 inline-flex rounded-2xl border bg-card p-1">
        {([
          ["recepcion", "Recepción", Truck],
          ["historial", "Historial", History],
          ["proveedores", "Proveedores", Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-medium transition-colors",
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : tab === "recepcion" ? (
        <RecepcionTab proveedores={proveedores.filter((p) => p.activo)} />
      ) : tab === "historial" ? (
        <HistorialTab proveedores={proveedores} />
      ) : (
        <ProveedoresTab proveedores={proveedores} onChanged={load} />
      )}
    </AppShell>
  );
}

// ── Recepción ─────────────────────────────────────────────────

function RecepcionTab({ proveedores }: { proveedores: Proveedor[] }) {
  const [proveedorId, setProveedorId] = useState("");
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [remito, setRemito] = useState("");
  const [condicion, setCondicion] = useState<CompraCondicion>("contado");
  const [pagada, setPagada] = useState(true);
  const [working, setWorking] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchProducts(q, 8).then(setResults).catch(() => setResults([]));
    }, 250);
  };

  const agregar = (p: Product) => {
    setQuery("");
    setResults([]);
    setItems((prev) => {
      if (prev.some((i) => i.productoId === p.id)) {
        toast.info("El producto ya está en la lista");
        return prev;
      }
      return [
        ...prev,
        {
          productoId: p.id,
          nombre: p.name,
          precioVenta: p.price,
          cantidad: "1",
          costoUnitario: p.precioBase ? String(p.precioBase) : "",
        },
      ];
    });
  };

  const actualizarItem = (id: string, campo: "cantidad" | "costoUnitario", valor: string) => {
    setItems((prev) => prev.map((i) => (i.productoId === id ? { ...i, [campo]: valor } : i)));
  };

  const quitar = (id: string) => setItems((prev) => prev.filter((i) => i.productoId !== id));

  const itemsNumericos = items.map((i) => ({
    ...i,
    cantidadNum: Number(i.cantidad),
    costoNum: Number(i.costoUnitario),
  }));
  const itemsValidos = itemsNumericos.every(
    (i) => Number.isFinite(i.cantidadNum) && i.cantidadNum > 0 && Number.isFinite(i.costoNum) && i.costoNum >= 0,
  );
  const total = totalCompra(
    itemsNumericos
      .filter((i) => Number.isFinite(i.cantidadNum) && Number.isFinite(i.costoNum))
      .map((i) => ({ cantidad: i.cantidadNum, costoUnitario: i.costoNum })),
  );
  const puedeRegistrar = !!proveedorId && items.length > 0 && itemsValidos && !working;

  const handleRegistrar = async () => {
    if (!puedeRegistrar) return;
    const user = getCurrentUser();
    setWorking(true);
    try {
      const r = await recibirCompra({
        proveedorId,
        items: itemsNumericos.map((i) => ({
          productoId: i.productoId,
          cantidad: i.cantidadNum,
          costoUnitario: i.costoNum,
        })),
        remito: remito.trim() || undefined,
        condicion,
        pagada,
        usuarioId: user?.id,
        usuarioNombre: user?.nombre,
      });
      toast.success(`Compra registrada · ${formatCurrency(r.total)} · stock actualizado`);
      setItems([]);
      setRemito("");
      setCondicion("contado");
      setPagada(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la compra");
    } finally {
      setWorking(false);
    }
  };

  if (proveedores.length === 0) {
    return (
      <Card className="card-premium rounded-2xl">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Primero cargá un proveedor en la pestaña Proveedores
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="card-premium rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" /> Nueva recepción
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none"
            >
              <option value="">Proveedor…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <Input
              value={remito} onChange={(e) => setRemito(e.target.value)}
              placeholder="Remito / factura (opcional)" className="rounded-xl"
            />
            <div className="flex items-center gap-3">
              <select
                value={condicion}
                onChange={(e) => setCondicion(e.target.value as CompraCondicion)}
                className="border-input h-9 flex-1 rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none"
              >
                <option value="contado">Contado</option>
                <option value="cuenta_corriente">Cuenta corriente</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={pagada} onCheckedChange={setPagada} /> Pagada
              </label>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar producto por nombre o código…"
              className="rounded-xl pl-9"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border bg-card shadow-lg">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregar(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      stock {p.stock} · vende {formatCurrency(p.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-24 text-right">Cantidad</TableHead>
                    <TableHead className="w-32 text-right">Costo unit.</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Subtotal</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Margen</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsNumericos.map((i) => {
                    const margen = Number.isFinite(i.costoNum) ? margenPct(i.precioVenta, i.costoNum) : null;
                    return (
                      <TableRow key={i.productoId}>
                        <TableCell className="font-medium">{i.nombre}</TableCell>
                        <TableCell>
                          <Input
                            type="number" inputMode="decimal"
                            value={i.cantidad}
                            onChange={(e) => actualizarItem(i.productoId, "cantidad", e.target.value)}
                            className="h-8 rounded-lg text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" inputMode="decimal"
                            value={i.costoUnitario}
                            onChange={(e) => actualizarItem(i.productoId, "costoUnitario", e.target.value)}
                            className="h-8 rounded-lg text-right"
                          />
                        </TableCell>
                        <TableCell className="cifra hidden text-right sm:table-cell">
                          {Number.isFinite(i.cantidadNum) && Number.isFinite(i.costoNum)
                            ? formatCurrency(i.cantidadNum * i.costoNum)
                            : "—"}
                        </TableCell>
                        <TableCell className={cn(
                          "hidden text-right text-sm md:table-cell",
                          margen != null && margen < 0 ? "font-semibold text-destructive" : "text-muted-foreground",
                        )}>
                          {margen == null ? "—" : `${margen.toFixed(0)}%`}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => quitar(i.productoId)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="cifra text-lg font-bold">Total: {formatCurrency(total)}</p>
            <Button className="rounded-2xl" disabled={!puedeRegistrar} onClick={handleRegistrar}>
              {working ? "Registrando..." : "Registrar compra"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Historial ─────────────────────────────────────────────────

function HistorialTab({ proveedores }: { proveedores: Proveedor[] }) {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<{ compra: Compra; items: CompraItem[] } | null>(null);
  const [anulando, setAnulando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompras(await getCompras(filtroProveedor || undefined));
    } catch {
      toast.error("No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, [filtroProveedor]);

  useEffect(() => {
    load();
  }, [load]);

  const verDetalle = async (c: Compra) => {
    try {
      setDetalle(await getCompraDetalle(c.id));
    } catch {
      toast.error("No se pudo cargar el detalle");
    }
  };

  const handleAnular = async () => {
    if (!detalle) return;
    if (!window.confirm(`¿Anular la compra ${detalle.compra.id}? Se descuenta el stock que había sumado.`)) return;
    setAnulando(true);
    try {
      await anularCompra(detalle.compra.id, getCurrentUser()?.id);
      toast.success("Compra anulada, stock revertido");
      setDetalle(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular");
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="space-y-3">
      <select
        value={filtroProveedor}
        onChange={(e) => setFiltroProveedor(e.target.value)}
        className="border-input h-9 rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none"
      >
        <option value="">Todos los proveedores</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre}</option>
        ))}
      </select>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : compras.length === 0 ? (
        <Card className="card-premium rounded-2xl">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Sin compras registradas
          </CardContent>
        </Card>
      ) : (
        <Card className="card-premium rounded-2xl">
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="hidden sm:table-cell">Remito</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compras.map((c) => (
                    <TableRow key={c.id} onClick={() => verDetalle(c)} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(c.createdAt)}</TableCell>
                      <TableCell className="font-medium">{c.proveedorNombre}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{c.remito ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          c.estado === "anulada" && "border-destructive/50 text-destructive",
                          c.estado === "recibida" && !c.pagada && "border-warning text-warning",
                        )}>
                          {c.estado === "anulada" ? "anulada" : c.pagada ? "recibida" : "impaga"}
                        </Badge>
                      </TableCell>
                      <TableCell className="cifra text-right font-medium">{formatCurrency(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> {detalle.compra.proveedorNombre} · {formatDateTime(detalle.compra.createdAt)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                {detalle.compra.remito && <p className="text-muted-foreground">Remito: {detalle.compra.remito}</p>}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalle.items.map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{i.productoNombre}</TableCell>
                        <TableCell className="text-right">{i.cantidad}</TableCell>
                        <TableCell className="cifra text-right">{formatCurrency(i.costoUnitario)}</TableCell>
                        <TableCell className="cifra text-right">{formatCurrency(i.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="cifra text-right text-base font-bold">Total: {formatCurrency(detalle.compra.total)}</p>
              </div>
              {detalle.compra.estado === "recibida" && (
                <DialogFooter>
                  <Button variant="destructive" className="rounded-xl" disabled={anulando} onClick={handleAnular}>
                    <Ban className="mr-2 h-4 w-4" /> {anulando ? "Anulando..." : "Anular compra"}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Proveedores ───────────────────────────────────────────────

function ProveedoresTab({ proveedores, onChanged }: { proveedores: Proveedor[]; onChanged: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const abrir = (p: Proveedor | null) => {
    setEditando(p);
    setNombre(p?.nombre ?? "");
    setTelefono(p?.telefono ?? "");
    setNotas(p?.notas ?? "");
    setActivo(p?.activo ?? true);
    setDialogOpen(true);
  };

  const handleGuardar = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      if (editando) {
        await actualizarProveedor(editando.id, { nombre: nombre.trim(), telefono, notas, activo });
        toast.success("Proveedor actualizado");
      } else {
        await crearProveedor({ nombre: nombre.trim(), telefono, notas });
        toast.success("Proveedor creado");
      }
      setDialogOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button className="rounded-2xl" onClick={() => abrir(null)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
        </Button>
      </div>

      <Card className="card-premium rounded-2xl">
        <CardContent className="px-0 sm:px-6">
          {proveedores.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Sin proveedores</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proveedores.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{p.telefono ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(!p.activo && "border-destructive text-destructive")}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => abrir(p)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs">Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" autoFocus />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Notas</Label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} className="rounded-xl" />
            </div>
            {editando && (
              <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                <span className="text-sm font-medium">Activo</span>
                <Switch checked={activo} onCheckedChange={setActivo} />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="rounded-xl" disabled={saving || !nombre.trim()} onClick={handleGuardar}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
