"use client";

// Devolucion parcial de una venta, funciona aunque la caja de esa venta ya
// haya cerrado. Spec: docs/superpowers/specs/2026-09-21-devoluciones-post-cierre-design.md
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";
import { getDevueltoPorProducto, type ReembolsoTipo } from "@/services/sales-service";
import type { Sale } from "@/lib/types";

interface DevolucionDialogProps {
  venta: Sale | null;
  /** Si el usuario tiene una caja propia abierta hoy (habilita reembolso en efectivo). */
  tieneCajaHoy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    items: { productoId: string; cantidad: number }[];
    motivo: string;
    reembolso: ReembolsoTipo;
  }) => Promise<void>;
}

export function DevolucionDialog({ venta, tieneCajaHoy, onOpenChange, onSubmit }: DevolucionDialogProps) {
  const [pendientePorProducto, setPendientePorProducto] = useState<Record<string, number>>({});
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [reembolso, setReembolso] = useState<ReembolsoTipo>("ninguno");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const esFiado = venta?.paymentMethod === "fiado";

  useEffect(() => {
    if (!venta) return;
    setMotivo("");
    setCantidades({});
    setReembolso("ninguno");
    setLoading(true);
    getDevueltoPorProducto(venta.id)
      .then((devuelto) => {
        const pendiente: Record<string, number> = {};
        for (const item of venta.items) {
          pendiente[item.productId] = Math.max(0, item.quantity - (devuelto[item.productId] ?? 0));
        }
        setPendientePorProducto(pendiente);
      })
      .catch(() => toast.error("No se pudo consultar lo ya devuelto"))
      .finally(() => setLoading(false));
  }, [venta]);

  if (!venta) return null;

  const itemsConPendiente = venta.items.filter((i) => (pendientePorProducto[i.productId] ?? 0) > 0);

  const itemsADevolver = itemsConPendiente
    .map((i) => ({ ...i, cantidad: Number(cantidades[i.productId] ?? "") }))
    .filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0);

  const totalADevolver = itemsADevolver.reduce((s, i) => s + i.cantidad * i.price, 0);

  const algunaCantidadInvalida = Object.entries(cantidades).some(([productId, valor]) => {
    if (!valor.trim()) return false;
    const n = Number(valor);
    const max = pendientePorProducto[productId] ?? 0;
    return !Number.isFinite(n) || n < 0 || n > max;
  });

  const puedeConfirmar = itemsADevolver.length > 0 && !algunaCantidadInvalida && !working;

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    setWorking(true);
    try {
      await onSubmit({
        items: itemsADevolver.map((i) => ({ productoId: i.productId, cantidad: i.cantidad })),
        motivo: motivo.trim(),
        reembolso: esFiado ? "ninguno" : reembolso,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la devolución");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={!!venta} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-primary" /> Devolver · venta {venta.saleNumber ?? venta.id}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : itemsConPendiente.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No queda nada pendiente por devolver de esta venta.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {itemsConPendiente.map((item) => {
                const max = pendientePorProducto[item.productId] ?? 0;
                return (
                  <div key={item.productId} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        pendiente {Number.isInteger(max) ? max : max.toFixed(2)} · {formatCurrency(item.price)} c/u
                      </p>
                    </div>
                    <Input
                      type="number" inputMode="decimal"
                      placeholder="0"
                      value={cantidades[item.productId] ?? ""}
                      onChange={(e) => setCantidades((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                      className="h-9 w-24 rounded-lg text-right"
                    />
                  </div>
                );
              })}
            </div>

            {esFiado ? (
              <div className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                Venta fiada: se le descuenta {formatCurrency(totalADevolver)} de la deuda al cliente. No hay efectivo de por medio.
              </div>
            ) : (
              <div>
                <Label className="mb-1 block text-xs">Reembolso</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!tieneCajaHoy}
                    onClick={() => setReembolso("efectivo")}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      reembolso === "efectivo" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                    } ${!tieneCajaHoy ? "cursor-not-allowed opacity-50" : "hover:text-foreground"}`}
                  >
                    Efectivo del cajón
                  </button>
                  <button
                    type="button"
                    onClick={() => setReembolso("ninguno")}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      reembolso === "ninguno" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sin reembolso (cambio)
                  </button>
                </div>
                {!tieneCajaHoy && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Abrí tu caja de hoy para poder reembolsar en efectivo.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label className="mb-1 block text-xs">Motivo (opcional)</Label>
              <Input
                value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: producto en mal estado" className="rounded-xl"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
              <span className="text-sm font-semibold">Total a devolver</span>
              <span className="cifra text-lg font-bold">{formatCurrency(totalADevolver)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {itemsConPendiente.length > 0 && (
            <Button className="rounded-xl" disabled={!puedeConfirmar} onClick={handleConfirmar}>
              {working ? "Registrando..." : "Confirmar devolución"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
