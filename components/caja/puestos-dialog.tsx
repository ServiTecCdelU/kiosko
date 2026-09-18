"use client";

// Administracion de puestos de cobro (solo admin): crear, renombrar, activar.
import { useState } from "react";
import { toast } from "sonner";
import { Monitor, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { crearPuesto, actualizarPuesto, type PuestoConEstado } from "@/services/caja-service";

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

  const handleCrear = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
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
    try {
      await actualizarPuesto(p.id, { activo });
      toast.success(activo ? "Puesto activado" : "Puesto desactivado");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el puesto");
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
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
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
      </DialogContent>
    </Dialog>
  );
}
