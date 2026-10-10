"use client";
// components/superadmin/planes-dialog.tsx — precio mensual de cada plan, cajas
// incluidas, precio por caja extra y tope de cajas (migraciones 49 y 52).
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
      await superadminApi({
        accion: "guardarPlan", plan: p.plan, precioMensual: p.precioMensual, descripcion: p.descripcion,
        cajasIncluidas: p.cajasIncluidas, precioCajaExtra: p.precioCajaExtra, maxCajas: p.maxCajas,
      });
      toast.success(`Plan ${p.nombre} guardado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(null);
    }
  };

  const cambiar = (plan: string, cambios: Partial<PlanSaas>) =>
    setPlanes((prev) => (prev ?? []).map((p) => (p.plan === plan ? { ...p, ...cambios } : p)));

  const campo = (label: string, children: React.ReactNode) => (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Planes y precios</DialogTitle>
          <DialogDescription>
            Cada comercio paga el precio del plan más las cajas activas que superen las incluidas. Con precio 0 el plan no
            se cobra ni se bloquea. El tope de cajas impide crear más puestos (vacío = sin tope).
          </DialogDescription>
        </DialogHeader>
        {!planes ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3">
            {planes.map((p) => (
              <div key={p.plan} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{p.nombre}</p>
                  <Button size="sm" className="h-8 rounded-xl" disabled={guardando === p.plan} onClick={() => guardar(p)}>
                    {guardando === p.plan ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                  </Button>
                </div>
                {campo("Qué incluye", <Input value={p.descripcion ?? ""} onChange={(e) => cambiar(p.plan, { descripcion: e.target.value })} className="h-9 rounded-xl" />)}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {campo("$ por mes", <Input type="number" inputMode="decimal" value={p.precioMensual} onChange={(e) => cambiar(p.plan, { precioMensual: Number(e.target.value) || 0 })} className="h-9 rounded-xl text-right" />)}
                  {campo("Cajas incluidas", <Input type="number" inputMode="numeric" min={1} value={p.cajasIncluidas} onChange={(e) => cambiar(p.plan, { cajasIncluidas: Math.max(1, Number(e.target.value) || 1) })} className="h-9 rounded-xl text-right" />)}
                  {campo("$ por caja extra", <Input type="number" inputMode="decimal" value={p.precioCajaExtra} onChange={(e) => cambiar(p.plan, { precioCajaExtra: Number(e.target.value) || 0 })} className="h-9 rounded-xl text-right" />)}
                  {campo("Tope de cajas", <Input type="number" inputMode="numeric" min={1} placeholder="sin tope" value={p.maxCajas ?? ""} onChange={(e) => cambiar(p.plan, { maxCajas: e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1) })} className="h-9 rounded-xl text-right" />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
