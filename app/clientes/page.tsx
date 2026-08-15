"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { listClientes } from "@/services/clientes-service";
import { DeudoresPanel } from "@/components/clientes/deudores-panel";
import { NuevoClienteDialog } from "@/components/clientes/nuevo-cliente-dialog";
import { ClienteDetailDialog } from "@/components/clientes/cliente-detail-dialog";
import type { Cliente } from "@/lib/types";

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClientes(await listClientes(debounced));
    } catch {
      toast.error("No se pudieron cargar los clientes");
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPorCobrar = clientes.reduce((s, c) => s + Math.max(0, c.saldo), 0);
  const conDeuda = clientes.filter((c) => c.saldo > 0).length;

  const abrirDetalle = (id: string) => {
    setDetalleId(id);
    setDetalleOpen(true);
  };

  return (
    <AppShell title="Clientes">
      {/* Resumen */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="card-premium rounded-2xl p-4">
          <div className="eyebrow flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-warning" /> Total por cobrar
          </div>
          <p className="cifra-hero mt-1.5 text-3xl text-warning">{formatCurrency(totalPorCobrar)}</p>
        </div>
        <div className="card-premium rounded-2xl p-4">
          <div className="eyebrow flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" /> Con deuda
          </div>
          <p className="cifra-hero mt-1.5 text-3xl">{conDeuda}</p>
        </div>
      </div>

      <DeudoresPanel onVerCliente={abrirDetalle} />

      {/* Buscador + alta */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o documento..."
            className="rounded-2xl pl-10"
          />
        </div>
        <Button className="rounded-2xl" onClick={() => setNuevoOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      {/* Listado */}
      <div className="rounded-2xl border bg-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : clientes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {debounced ? "Sin resultados" : "Todavía no hay clientes. Creá el primero."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{c.telefono ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("cifra font-semibold", c.saldo > 0 ? "text-warning" : "text-muted-foreground")}>
                        {formatCurrency(c.saldo)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => abrirDetalle(c.id)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NuevoClienteDialog open={nuevoOpen} onOpenChange={setNuevoOpen} onCreated={() => load()} />
      <ClienteDetailDialog
        clienteId={detalleId}
        open={detalleOpen}
        onOpenChange={setDetalleOpen}
        onChanged={() => load()}
      />
    </AppShell>
  );
}
