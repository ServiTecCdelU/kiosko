"use client";

// components/pos/ventas-offline-dialog.tsx — ventas hechas sin internet que
// todavia no estan en el sistema. Las rechazadas por el servidor (caja cerrada,
// stock...) se resuelven aca: reintentar, pasarlas a la caja actual o
// descartarlas a conciencia. Ninguna se borra sola: ya se cobraron.
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CloudOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { createSale } from "@/services/sales-service";
import {
  actualizarVentaPendiente, listarVentasPendientes, marcarVentaConError, quitarVentaPendiente, type VentaPendiente,
} from "@/lib/offline/db";
import { conCandado } from "@/lib/offline/candado";
import { clasificarError, esErrorDeCaja, totalPendiente } from "@/lib/offline/cola";

interface VentasOfflineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendientes: VentaPendiente[];
  /** Caja abierta ahora en este POS (para pasarle una venta rechazada por caja cerrada). */
  cajaIdActual?: string;
  onCambio: () => void;
  onSincronizarTodo: () => Promise<void>;
}

function FilaVenta({ v, cajaIdActual, onCambio }: { v: VentaPendiente; cajaIdActual?: string; onCambio: () => void }) {
  const [trabajando, setTrabajando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const puedePasarDeCaja = esErrorDeCaja(v.error) && !!cajaIdActual && cajaIdActual !== v.input.cajaId;

  const reintentar = async (cajaId?: string) => {
    setTrabajando(true);
    try {
      // Turno exclusivo con la sincronizacion automatica: nunca dos envios de la misma venta.
      await conCandado(async () => {
        const actual = (await listarVentasPendientes()).find((x) => x.id === v.id);
        if (!actual) {
          toast.success("Esa venta ya se guardó");
          return;
        }
        const input = cajaId ? { ...actual.input, cajaId } : actual.input;
        if (cajaId) await actualizarVentaPendiente(v.id, { input });
        try {
          await createSale(input);
          await quitarVentaPendiente(v.id);
          toast.success("Venta guardada");
        } catch (e) {
          const tipo = clasificarError(e);
          const motivo = e instanceof Error ? e.message : "Error desconocido";
          if (tipo === "rechazada") await marcarVentaConError(v.id, motivo);
          else await actualizarVentaPendiente(v.id, { error: null });
          toast.error(tipo === "sin_red" ? "Sigue sin conexión: queda en la cola" : motivo);
        }
      });
    } finally {
      setTrabajando(false);
      onCambio();
    }
  };

  const descartar = async () => {
    await conCandado(() => quitarVentaPendiente(v.id));
    toast.success("Venta descartada");
    onCambio();
  };

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{formatDateTime(new Date(v.createdAt))}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {v.input.items.map((i) => `${i.quantity} × ${i.name ?? i.productId}`).join(" · ")}
          </p>
        </div>
        <span className="cifra shrink-0 font-semibold">{formatCurrency(totalPendiente(v))}</span>
      </div>
      {v.error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {v.error}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {puedePasarDeCaja && (
          <Button size="sm" className="h-7 rounded-lg" disabled={trabajando} onClick={() => reintentar(cajaIdActual)}>
            Pasar a mi caja actual
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 rounded-lg" disabled={trabajando} onClick={() => reintentar()}>
          {trabajando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Reintentar
        </Button>
        {confirmar ? (
          <>
            <Button size="sm" variant="destructive" className="h-7 rounded-lg" onClick={descartar}>Sí, descartar</Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => setConfirmar(false)}>No</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-muted-foreground" disabled={trabajando} onClick={() => setConfirmar(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Descartar
          </Button>
        )}
      </div>
      {confirmar && (
        <p className="text-xs text-destructive">Esta venta ya se cobró: si la descartás no queda registrada ni descuenta stock.</p>
      )}
    </li>
  );
}

export function VentasOfflineDialog({ open, onOpenChange, pendientes, cajaIdActual, onCambio, onSincronizarTodo }: VentasOfflineDialogProps) {
  const [sincronizando, setSincronizando] = useState(false);
  const enCola = pendientes.filter((v) => !v.error).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CloudOff className="h-4 w-4" /> Ventas sin conexión</DialogTitle>
          <DialogDescription>
            Ventas cobradas sin internet que todavía no están en el sistema. Se guardan solas al volver la conexión;
            las que el sistema rechazó hay que resolverlas acá.
          </DialogDescription>
        </DialogHeader>

        {pendientes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No hay ventas pendientes.</p>
        ) : (
          <ul className="divide-y">
            {pendientes.map((v) => <FilaVenta key={v.id} v={v} cajaIdActual={cajaIdActual} onCambio={onCambio} />)}
          </ul>
        )}

        {enCola > 0 && (
          <Button
            className="w-full rounded-xl"
            disabled={sincronizando}
            onClick={async () => {
              setSincronizando(true);
              await onSincronizarTodo().finally(() => setSincronizando(false));
            }}
          >
            {sincronizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Guardar ahora las {enCola} pendientes
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
