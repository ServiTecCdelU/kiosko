"use client";
// components/superadmin/comercio-dialog.tsx — "Administrar" un comercio:
// estado, plan, pago del mes y correos con acceso de Google.
import { toast } from "sonner";
import { Check, CircleDollarSign, LogIn } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { AccesosGoogle } from "@/components/superadmin/accesos-google";
import { pagoAlDia, superadminApi, type Comercio } from "@/components/superadmin/comun";

interface ComercioDialogProps {
  comercio: Comercio | null;
  onOpenChange: (open: boolean) => void;
  onCambio: () => Promise<void>;
  onEntrar: (c: Comercio) => void;
}

const selectClase = "border-input h-9 w-full rounded-xl border bg-transparent px-2 text-sm outline-none";

export function ComercioDialog({ comercio, onOpenChange, onCambio, onEntrar }: ComercioDialogProps) {
  if (!comercio) return null;
  const alDia = pagoAlDia(comercio);

  const cambiar = async (cambios: Record<string, unknown>) => {
    try {
      await superadminApi({ id: comercio.id, ...cambios }, "PATCH");
      toast.success("Comercio actualizado");
      await onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  const marcarPago = async () => {
    try {
      await superadminApi({ accion: "marcarPago", id: comercio.id });
      toast.success("Pago del mes registrado");
      await onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{comercio.nombre}</DialogTitle>
          <DialogDescription>
            {comercio.slug} · desde {formatDate(comercio.created_at)}
            {comercio.trial_hasta && ` · prueba hasta ${formatDate(comercio.trial_hasta)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Estado</Label>
              <select value={comercio.estado} onChange={(e) => cambiar({ estado: e.target.value })} className={selectClase}>
                <option value="prueba">Prueba</option>
                <option value="activo">Activo</option>
                <option value="suspendido">Suspendido</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Plan</Label>
              <select value={comercio.plan} onChange={(e) => cambiar({ plan: e.target.value })} className={selectClase}>
                <option value="free">Free</option>
                <option value="basico">Básico</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
            <Badge variant="outline" className={cn(alDia ? "border-success/50 text-success" : "border-warning text-warning")}>
              {alDia ? <Check className="mr-1 h-3 w-3" /> : <CircleDollarSign className="mr-1 h-3 w-3" />}
              {alDia ? "Pago al día" : "Pago pendiente este mes"}
            </Badge>
            {!alDia && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={marcarPago}>Marcar pago del mes</Button>
            )}
          </div>

          <AccesosGoogle comercioId={comercio.id} onCambio={onCambio} />

          <Button className="w-full rounded-xl" onClick={() => onEntrar(comercio)}>
            <LogIn className="mr-2 h-4 w-4" /> Entrar al panel de {comercio.nombre}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
