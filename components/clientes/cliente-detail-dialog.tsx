"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Contact, NotebookPen, Banknote, ShoppingCart } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { getCliente, getMovimientos, registrarPago } from "@/services/clientes-service";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Cliente, CuentaMov } from "@/lib/types";

interface ClienteDetailDialogProps {
  clienteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const TIPO_LABEL: Record<CuentaMov["tipo"], string> = {
  cargo: "Fiado",
  pago: "Pago",
  ajuste: "Ajuste",
};

export function ClienteDetailDialog({ clienteId, open, onOpenChange, onChanged }: ClienteDetailDialogProps) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [movs, setMovs] = useState<CuentaMov[]>([]);
  const [loading, setLoading] = useState(true);
  const [monto, setMonto] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    try {
      const [c, m] = await Promise.all([getCliente(clienteId), getMovimientos(clienteId)]);
      setCliente(c);
      setMovs(m);
    } catch {
      toast.error("No se pudo cargar el cliente");
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    if (open && clienteId) {
      setMonto("");
      load();
    }
  }, [open, clienteId, load]);

  const handlePago = async () => {
    if (!cliente) return;
    const n = Number(monto) || 0;
    if (n <= 0) {
      toast.error("Ingresá un monto mayor a cero");
      return;
    }
    setWorking(true);
    try {
      const user = getCurrentUser();
      const res = await registrarPago(cliente.id, n, user?.nombre);
      toast.success(`Pago registrado · saldo ${formatCurrency(res.saldoNuevo)}`);
      setMonto("");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente?.nombre ?? "Cliente"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando...</p>
        ) : !cliente ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cliente no encontrado</p>
        ) : (
          <div className="space-y-4">
            {/* Saldo */}
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deuda actual</p>
              <p className={cn("cifra mt-1 text-4xl font-bold", cliente.saldo > 0 ? "text-warning" : "text-success")}>
                {formatCurrency(cliente.saldo)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {cliente.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{cliente.telefono}</span>}
                {cliente.documento && <span className="flex items-center gap-1"><Contact className="h-3 w-3" />{cliente.documento}</span>}
                {cliente.limiteCredito > 0 && <span>Límite: {formatCurrency(cliente.limiteCredito)}</span>}
              </div>
            </div>

            {/* Registrar pago */}
            <div className="rounded-2xl border bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Banknote className="h-4 w-4 text-primary" /> Registrar pago
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" inputMode="decimal" placeholder="Monto que abona"
                  value={monto} onChange={(e) => setMonto(e.target.value)}
                  className="rounded-xl"
                />
                {cliente.saldo > 0 && (
                  <Button variant="outline" className="rounded-xl" onClick={() => setMonto(String(cliente.saldo))}>
                    Todo
                  </Button>
                )}
                <Button className="rounded-xl" disabled={working || !monto} onClick={handlePago}>
                  {working ? "..." : "Cobrar"}
                </Button>
              </div>
            </div>

            {/* Movimientos */}
            <div>
              <p className="mb-2 text-sm font-semibold">Movimientos</p>
              {movs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos aún</p>
              ) : (
                <ul className="space-y-1">
                  {movs.map((m) => {
                    const esPago = m.tipo === "pago";
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg",
                            esPago ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                          )}>
                            {esPago ? <Banknote className="h-4 w-4" /> : m.ventaId ? <ShoppingCart className="h-4 w-4" /> : <NotebookPen className="h-4 w-4" />}
                          </span>
                          <div>
                            <p className="text-sm font-medium">{TIPO_LABEL[m.tipo]}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(m.fecha)}</p>
                          </div>
                        </div>
                        <span className={cn("cifra text-sm font-semibold", esPago ? "text-success" : "text-warning")}>
                          {esPago ? "-" : "+"}{formatCurrency(m.monto)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
