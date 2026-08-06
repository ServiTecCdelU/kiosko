"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Search, AlertTriangle, ChevronLeft, ChevronRight, Tag, Upload, Pencil,
  Package, PackageX, ClipboardList, Layers,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getProductsPage, setOferta, getStockStats, getCategorias, updateProduct,
  type SetOfertaInput, type StockStats, type UpdateProductInput,
} from "@/services/products-service";
import { ajustarStock } from "@/services/stock-service";
import { OfertaDialog } from "@/components/stock/oferta-dialog";
import { ImportDialog } from "@/components/stock/import-dialog";
import { EditarProductoDialog } from "@/components/stock/editar-producto-dialog";
import { getCurrentUser } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal, tieneOferta } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

const PAGE_SIZE = 30;

type QuickFilter = "todos" | "stockBajo" | "agotados" | "revisar";

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [categoria, setCategoria] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [stats, setStats] = useState<StockStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [ofertaProduct, setOfertaProduct] = useState<Product | null>(null);
  const [ofertaOpen, setOfertaOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced, quickFilter, categoria]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getStockStats());
    } catch {
      // no crítico, no bloquea la pantalla
    }
  }, []);

  const loadCategorias = useCallback(async () => {
    try {
      setCategorias(await getCategorias());
    } catch {
      // no crítico
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProductsPage({
        search: debounced,
        soloStockBajo: quickFilter === "stockBajo",
        soloAgotados: quickFilter === "agotados",
        soloRevisar: quickFilter === "revisar",
        categoria: categoria || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setProducts(res.products);
      setTotal(res.total);
    } catch {
      toast.error("No se pudo cargar el stock");
    } finally {
      setLoading(false);
    }
  }, [debounced, quickFilter, categoria, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStats();
    loadCategorias();
  }, [loadStats, loadCategorias]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadStats(), loadCategorias()]);
  }, [load, loadStats, loadCategorias]);

  const openEdit = (p: Product) => {
    setSelected(p);
    setEditOpen(true);
  };

  const openOferta = (p: Product) => {
    setOfertaProduct(p);
    setOfertaOpen(true);
  };

  const handleOferta = async (oferta: SetOfertaInput) => {
    if (!ofertaProduct) return;
    try {
      await setOferta(ofertaProduct.id, oferta);
      toast.success(oferta.activa ? "Oferta aplicada" : "Oferta quitada");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar la oferta");
    }
  };

  const handleSaveProduct = async (input: UpdateProductInput) => {
    if (!selected) return;
    try {
      await updateProduct(selected.id, input);
      toast.success("Producto actualizado");
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el producto");
    }
  };

  const handleAjuste = async (tipo: "entrada" | "ajuste" | "rotura", cantidad: number) => {
    if (!selected) return;
    try {
      const user = getCurrentUser();
      const res = await ajustarStock({ productoId: selected.id, tipo, cantidad, usuario: user?.nombre });
      toast.success(`Stock actualizado: ${res.stockNuevo}`);
      setSelected((s) => (s ? { ...s, stock: res.stockNuevo } : s));
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al ajustar");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cards = useMemo(
    () => [
      { key: "todos" as QuickFilter, label: "Total productos", value: stats?.total ?? "—", icon: Layers, color: "text-foreground" },
      { key: "stockBajo" as QuickFilter, label: "Stock bajo", value: stats?.stockBajo ?? "—", icon: Package, color: "text-warning" },
      { key: "agotados" as QuickFilter, label: "Agotados", value: stats?.agotados ?? "—", icon: PackageX, color: "text-destructive" },
      { key: "revisar" as QuickFilter, label: "A revisar", value: stats?.revisar ?? "—", icon: ClipboardList, color: "text-warning" },
    ],
    [stats],
  );

  return (
    <AppShell title="Stock">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setQuickFilter((f) => (f === c.key ? "todos" : c.key))}
            className={cn(
              "rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/50",
              quickFilter === c.key && "border-primary bg-primary/10",
            )}
          >
            <c.icon className={cn("mb-2 h-4 w-4", c.color)} />
            <p className={cn("cifra text-2xl font-bold", c.color)}>{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o codigo..."
            className="rounded-2xl pl-10"
          />
        </div>
        {categorias.length > 0 && (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-2xl border bg-card px-4 py-2 text-sm"
          >
            <option value="">Todos los rubros</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <Button className="rounded-2xl" onClick={() => setImportOpen(true)}>
          <Upload className="mr-2 h-4 w-4" /> Importar productos
        </Button>
      </div>

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : products.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sin productos</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cód. barra</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Rubro</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Mín.</TableHead>
                  <TableHead className="text-right">Lote</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const sinStock = p.stock <= 0;
                  const bajo = !sinStock && p.stock <= p.stockMinimo;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground">{p.codigoBarras || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.codigo || "—"}</TableCell>
                      <TableCell>
                        <p className="line-clamp-1 font-medium">{p.name}</p>
                        {p.revisar && (
                          <Badge variant="outline" className="mt-1 border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />A revisar
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.category || "—"}</TableCell>
                      <TableCell className="text-right">
                        {tieneOferta(p) ? (
                          <span className="flex flex-col items-end leading-tight">
                            <span className="text-xs text-muted-foreground line-through">
                              {formatCurrency(p.price)}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-money">
                              <Tag className="h-3 w-3" />
                              {formatCurrency(precioFinal(p))}
                            </span>
                          </span>
                        ) : (
                          formatCurrency(p.price)
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {p.precioBase && p.price > 0 ? (
                          (() => {
                            const margen = ((p.price - p.precioBase) / p.price) * 100;
                            return (
                              <span className={margen < 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                                {margen.toFixed(0)}%
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("font-semibold", sinStock ? "text-destructive" : bajo ? "text-warning" : "")}>
                          {p.stock}
                        </span>
                        {(sinStock || bajo) && (
                          <Badge variant="outline" className="ml-2 border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />{sinStock ? "Agotado" : "Bajo"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{p.stockMinimo}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{p.lote ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("rounded-xl", tieneOferta(p) && "border-money/50 text-money")}
                            onClick={() => openOferta(p)}
                          >
                            <Tag className="mr-1 h-3.5 w-3.5" /> Oferta
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openEdit(p)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {quickFilter === "todos" && total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" className="rounded-xl" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Pagina {page + 1} de {totalPages}</span>
          <Button variant="outline" size="icon" className="rounded-xl" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <EditarProductoDialog
        product={selected}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleSaveProduct}
        onAjustarStock={handleAjuste}
      />
      <OfertaDialog product={ofertaProduct} open={ofertaOpen} onOpenChange={setOfertaOpen} onSubmit={handleOferta} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={refreshAll} />
    </AppShell>
  );
}
