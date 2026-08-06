"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Search, AlertTriangle, SlidersHorizontal, ChevronLeft, ChevronRight, Tag, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getProductsPage, setOferta, type SetOfertaInput } from "@/services/products-service";
import { ajustarStock } from "@/services/stock-service";
import { AjusteDialog } from "@/components/stock/ajuste-dialog";
import { OfertaDialog } from "@/components/stock/oferta-dialog";
import { ImportDialog } from "@/components/stock/import-dialog";
import { getCurrentUser } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal, tieneOferta } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

const PAGE_SIZE = 30;

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ofertaProduct, setOfertaProduct] = useState<Product | null>(null);
  const [ofertaOpen, setOfertaOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced, soloStockBajo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProductsPage({ search: debounced, soloStockBajo, page, pageSize: PAGE_SIZE });
      setProducts(res.products);
      setTotal(res.total);
    } catch {
      toast.error("No se pudo cargar el stock");
    } finally {
      setLoading(false);
    }
  }, [debounced, soloStockBajo, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openAjuste = (p: Product) => {
    setSelected(p);
    setDialogOpen(true);
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

  const handleAjuste = async (tipo: "entrada" | "ajuste" | "rotura", cantidad: number) => {
    if (!selected) return;
    try {
      const user = getCurrentUser();
      const res = await ajustarStock({ productoId: selected.id, tipo, cantidad, usuario: user?.nombre });
      toast.success(`Stock actualizado: ${res.stockNuevo}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al ajustar");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell title="Stock">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o codigo..."
            className="rounded-2xl pl-10"
          />
        </div>
        <label className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-2 text-sm">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          Solo stock bajo
          <Switch checked={soloStockBajo} onCheckedChange={setSoloStockBajo} />
        </label>
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
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Min.</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const sinStock = p.stock <= 0;
                  const bajo = !sinStock && p.stock <= p.stockMinimo;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="line-clamp-1 font-medium">{p.name}</p>
                        {p.codigo && <span className="text-xs text-muted-foreground">{p.codigo}</span>}
                        {p.revisar && (
                          <Badge variant="outline" className="ml-2 border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />A revisar
                          </Badge>
                        )}
                      </TableCell>
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
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openAjuste(p)}>
                            Ajustar
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

      {!soloStockBajo && total > PAGE_SIZE && (
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

      <AjusteDialog product={selected} open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleAjuste} />
      <OfertaDialog product={ofertaProduct} open={ofertaOpen} onOpenChange={setOfertaOpen} onSubmit={handleOferta} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
    </AppShell>
  );
}
