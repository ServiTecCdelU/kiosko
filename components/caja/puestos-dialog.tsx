"use client";

// Administracion de puestos de cobro (solo admin): crear, renombrar, activar.
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Monitor, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { crearPuesto, actualizarPuesto, type PuestoConEstado } from "@/services/caja-service";
import { ModalPlanPro } from "@/components/plan/modal-plan-pro";
import { useAuth } from "@/hooks/use-auth";

interface PuestosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puestos: PuestoConEstado[];
  /** Recargar la pantalla de caja despues de un cambio. */
  onChanged: () => void;
}

export function PuestosDialog({ open, onOpenChange, puestos, onChanged }: PuestosDialogProps) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [working, setWorking] = useState(false);
  const [modalPro, setModalPro] = useState(false);
  const { user } = useAuth();
  // Plan Basico: 1 caja. Sumar o reactivar otra muestra el modal de plan Pro
  // (el servidor lo frena igual: errorAlSumarCaja en /api/puestos).
  const activos = puestos.filter((p) => p.activo).length;
  const topeBasico = user?.plan === "basico" && activos >= 1;

  const handleCrear = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    if (topeBasico) {
      setModalPro(true);
      return;
    }
    setWorking(true);
    try {
      await crearPuesto(nombre);
      toast.success(`Puesto "${nombre}" creado`);
      setNuevoNombre("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el puesto");
    } finally {
      setWorking(false);
    }
  };

  const handleActivo = async (p: PuestoConEstado, activo: boolean) => {
    if (activo && topeBasico) {
      setModalPro(true);
      return;
    }
    try {
      await actualizarPuesto(p.id, { activo });
      toast.success(activo ? "Puesto activado" : "Puesto desactivado");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el puesto");
    }
  };

  const handlePuntoVenta = async (p: PuestoConEstado, valor: string) => {
    const pv = valor.trim() === "" ? null : Number(valor);
    if (pv === p.puntoVentaAfip) return;
    try {
      await actualizarPuesto(p.id, { puntoVentaAfip: pv });
      toast.success(pv ? `${p.nombre}: factura con el punto de venta ${pv}` : `${p.nombre}: usa el punto de venta general`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el punto de venta");
    }
  };

  const handleRenombrar = async (p: PuestoConEstado) => {
    const nombre = window.prompt("Nuevo nombre del puesto:", p.nombre)?.trim();
    if (!nombre || nombre === p.nombre) return;
    try {
      await actualizarPuesto(p.id, { nombre });
      toast.success("Puesto renombrado");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo renombrar el puesto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" /> Puestos de cobro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {puestos.map((p) => (
            <div key={p.id} className="space-y-2 rounded-xl border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                className="text-left text-sm font-medium hover:underline"
                onClick={() => handleRenombrar(p)}
                title="Renombrar"
              >
                {p.nombre}
              </button>
              <div className="flex items-center gap-2">
                {p.cajaAbiertaId && (
                  <Badge variant="outline" className="border-success/50 text-success">
                    abierta{p.cajaAbiertaPor ? ` · ${p.cajaAbiertaPor}` : ""}
                  </Badge>
                )}
                <Switch
                  checked={p.activo}
                  disabled={!!p.cajaAbiertaId && p.activo}
                  onCheckedChange={(v) => handleActivo(p, v)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Punto de venta AFIP
              <Input
                key={`${p.id}-${p.puntoVentaAfip ?? ""}`}
                defaultValue={p.puntoVentaAfip ?? ""}
                onBlur={(e) => handlePuntoVenta(p, e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={5}
                placeholder="general"
                className="h-7 w-20 rounded-lg text-xs"
              />
              <span>(vacío = el de Facturación)</span>
            </label>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del puesto (ej: Caja 2)"
            className="rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && handleCrear()}
          />
          <Button className="rounded-xl" disabled={working || !nuevoNombre.trim()} onClick={handleCrear}>
            <Plus className="mr-1 h-4 w-4" /> Agregar
          </Button>
        </div>
        {topeBasico && (
          <p className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-primary"><Lock className="h-3 w-3" /> Plan Básico: una caja.</span>{" "}
            Para sumar cajas, pasá al plan Pro desde Suscripción.
          </p>
        )}
        <ModalPlanPro funcion={modalPro ? "cajas" : null} onOpenChange={setModalPro} />
      </DialogContent>
    </Dialog>
  );
}
