"use client";

// app/presupuestos/page.tsx — presupuestos guardados desde el POS: PDF, pasar a venta, anular.
// Diseño: docs/superpowers/specs/2026-10-18-presupuestos-design.md
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileDown, FileText, Search, ShoppingCart, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { estadoVisible, type EstadoVisible } from "@/lib/presupuesto";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";
import { descargarPresupuestoPdf } from "@/lib/utils/presupuesto-pdf";
import { getCurrentUser } from "@/hooks/use-auth";
import { useNombreComercio } from "@/components/stock/oferta-publicada";
import {
  anularPresupuesto, listarPresupuestos, obtenerPresupuesto, type Presupuesto,
} from "@/services/presupuestos-service";

const ESTADO: Record<EstadoVisible, { label: string; clase: string }> = {
  vigente: { label: "Vigente", clase: "border-primary text-primary" },
  vencido: { label: "Vencido", clase: "border-warning text-warning" },
  vendido: { label: "Vendido", clase: "border-money text-money" },
  anulado: { label: "Anulado", clase: "text-muted-foreground" },
};

/** "2026-11-02" -> "02/11/2026" sin pasar por Date. */
const fechaIso = (iso: string) => iso.split("-").reverse().join("/");

export default function PresupuestosPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [lista, setLista] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nombreComercio] = useNombreComercio();
  const hoy = hoyArgentinaISO();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await listarPresupuestos(debounced));
    } catch {
      toast.error("No se pudieron cargar los presupuestos");
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const pdf = async (p: Presupuesto) => {
    setOcupado(p.id);
    try {
      const { presupuesto } = await obtenerPresupuesto(p.id);
      if (!presupuesto) throw new Error("No se encontró el presupuesto");
      descargarPresupuestoPdf(presupuesto, nombreComercio.trim() || getCurrentUser()?.comercioNombre || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo bajar el PDF");
    } finally {
      setOcupado(null);
    }
  };

  const anular = (p: Presupuesto) => {
    toast(`¿Anular el presupuesto N° ${p.numero}?`, {
      description: "Ya no se va a poder pasar a venta.",
      action: {
        label: "Anular",
        onClick: async () => {
          try {
            await anularPresupuesto(p.id);
            toast.success(`Presupuesto N° ${p.numero} anulado`);
            load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo anular");
          }
        },
      },
    });
  };

  const vigentes = lista.filter((p) => estadoVisible(p.estado, p.vence, hoy) === "vigente");

  return (
    <AppShell title="Presupuestos">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="card-premium rounded-2xl p-4">
          <div className="eyebrow flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-primary" /> Vigentes
          </div>
          <p className="cifra-hero mt-1.5 text-3xl">{vigentes.length}</p>
        </div>
        <div className="card-premium rounded-2xl p-4">
          <div className="eyebrow">Total presupuestado vigente</div>
          <p className="cifra-hero mt-1.5 text-2xl text-money">{formatCurrency(vigentes.reduce((s, p) => s + p.total, 0))}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o número..."
            className="rounded-2xl pl-10"
          />
        </div>
        <Button className="rounded-2xl" asChild>
          <Link href="/pos"><ShoppingCart className="mr-1 h-4 w-4" /> Armar en el punto de venta</Link>
        </Button>
      </div>

      <div className="card-premium rounded-2xl">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : lista.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {debounced
              ? "Sin resultados"
              : "Todavía no hay presupuestos. En el punto de venta cargá los productos y tocá “Presupuesto” arriba del carrito."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden md:table-cell">Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((p) => {
                  const estado = estadoVisible(p.estado, p.vence, hoy);
                  const cobrable = p.estado === "vigente";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="cifra font-medium">{p.numero}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(p.createdAt)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate">{p.clienteNombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="cifra text-right font-semibold">{formatCurrency(p.total)}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{fechaIso(p.vence)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("rounded-lg", ESTADO[estado].clase)}>{ESTADO[estado].label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="rounded-xl" disabled={ocupado === p.id} onClick={() => pdf(p)} title="Bajar PDF">
                            <FileDown className="h-4 w-4" />
                          </Button>
                          {cobrable && (
                            <>
                              <Button size="sm" variant="outline" className="rounded-xl" asChild>
                                <Link href={`/pos?presupuesto=${encodeURIComponent(p.id)}`}>Pasar a venta</Link>
                              </Button>
                              <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => anular(p)} title="Anular">
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
      <p className="mt-3 text-xs text-muted-foreground">
        Mientras el presupuesto está vigente, al pasarlo a venta se cobra el precio presupuestado o el de hoy, el que sea menor.
        Vencido, va a precio de hoy.
      </p>
    </AppShell>
  );
}
