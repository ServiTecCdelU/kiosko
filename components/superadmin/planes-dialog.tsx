"use client";
// components/superadmin/planes-dialog.tsx — precio mensual de cada plan.
// Precio 0 = no se cobra ni se bloquea a nadie con ese plan.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { superadminApi, type PlanSaas } from "@/components/superadmin/comun";

export function PlanesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [planes, setPlanes] = useState<PlanSaas[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlanes(null);
    superadminApi<{ planes: PlanSaas[] }>({ accion: "planes" })
      .then((r) => setPlanes(r.planes))
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar los planes"));
  }, [open]);

  const guardar = async (p: PlanSaas) => {
    setGuardando(p.plan);
    try {
      await superadminApi({ accion: "guardarPlan", plan: p.plan, precioMensual: p.precioMensual, descripcion: p.descripcion });
      toast.success(`Plan ${p.nombre} guardado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(null);
    }
  };

  const cambiar = (plan: string, cambios: Partial<PlanSaas>) =>
    setPlanes((prev) => (prev ?? []).map((p) => (p.plan === plan ? { ...p, ...cambios } : p)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Planes y precios</DialogTitle>
          <DialogDescription>
            Precio mensual en pesos. Con precio 0 el plan no se cobra ni se bloquea. Los comercios activos con precio y
            fecha de pago vencida tienen 10 días de gracia y después pasan a modo consulta.
          </DialogDescription>
        </DialogHeader>
        {!planes ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3">
            {planes.map((p) => (
              <div key={p.plan} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">{p.nombre}</Label>
                  <Input value={p.descripcion ?? ""} onChange={(e) => cambiar(p.plan, { descripcion: e.target.value })} placeholder="Qué incluye" className="h-9 rounded-xl" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">$ por mes</Label>
                  <Input type="number" inputMode="decimal" value={p.precioMensual} onChange={(e) => cambiar(p.plan, { precioMensual: Number(e.target.value) || 0 })} className="h-9 rounded-xl text-right" />
                </div>
                <Button className="h-9 rounded-xl" disabled={guardando === p.plan} onClick={() => guardar(p)}>
                  {guardando === p.plan ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
