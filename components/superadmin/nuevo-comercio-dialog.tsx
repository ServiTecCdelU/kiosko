"use client";
// components/superadmin/nuevo-comercio-dialog.tsx — alta de un comercio, con el
// correo de Google del dueño para que pueda entrar desde el primer momento.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { superadminApi } from "@/components/superadmin/comun";

interface NuevoComercioDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => Promise<void>;
}

export function NuevoComercioDialog({ open, onOpenChange, onCreated }: NuevoComercioDialogProps) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [trialDias, setTrialDias] = useState("14");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre("");
      setSlug("");
      setTrialDias("14");
      setEmail("");
    }
  }, [open]);

  const emailInvalido = email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleCrear = async () => {
    if (!nombre.trim() || emailInvalido) return;
    setSaving(true);
    try {
      const { comercio } = await superadminApi<{ comercio: { id: string } }>({
        accion: "crear", nombre: nombre.trim(), slug: slug.trim(), trialDias: Number(trialDias) || 14,
      });
      if (email.trim()) {
        try {
          await superadminApi({ accion: "agregarAcceso", id: comercio.id, email: email.trim(), nombre: "Dueño" });
        } catch (e) {
          // El comercio ya quedo creado: se avisa y el correo se carga desde "Administrar"
          toast.error(`Comercio creado, pero no se pudo dar el acceso: ${e instanceof Error ? e.message : ""}`);
        }
      }
      toast.success(`Comercio "${nombre}" creado`);
      onOpenChange(false);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el comercio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo comercio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" autoFocus />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Correo de Google del dueño (opcional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl" placeholder="dueno@gmail.com" />
            {emailInvalido && <p className="mt-1 text-xs text-destructive">Correo inválido</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Slug (se genera solo)</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-xl" placeholder="mi-comercio" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Días de prueba</Label>
              <Input type="number" inputMode="numeric" value={trialDias} onChange={(e) => setTrialDias(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={saving || !nombre.trim() || emailInvalido} onClick={handleCrear}>
            {saving ? "Creando..." : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
