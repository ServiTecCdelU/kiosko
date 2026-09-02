"use client";

import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Usuario, UserRol } from "@/lib/types";

export interface UsuarioDialogInput {
  nombre: string;
  rol: UserRol;
  activo: boolean;
  /** undefined = no cambiar el PIN (solo aplica en edicion) */
  pin?: string;
}

interface UsuarioDialogProps {
  usuario: Usuario | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UsuarioDialogInput) => Promise<void>;
}

const PIN_REGEX = /^[0-9]{4}$/;

export function UsuarioDialog({ usuario, open, onOpenChange, onSave }: UsuarioDialogProps) {
  const esEdicion = !!usuario;
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<UserRol>("cajero");
  const [activo, setActivo] = useState(true);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(usuario?.nombre ?? "");
    setRol(usuario?.rol ?? "cajero");
    setActivo(usuario?.activo ?? true);
    setPin("");
    setPinConfirm("");
  }, [open, usuario]);

  const nombreInvalido = !nombre.trim();
  const pinTocado = pin.length > 0 || pinConfirm.length > 0;
  const pinInvalido = esEdicion
    ? pinTocado && (!PIN_REGEX.test(pin) || pin !== pinConfirm)
    : !PIN_REGEX.test(pin) || pin !== pinConfirm;
  const puedeGuardar = !nombreInvalido && !pinInvalido;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true);
    try {
      await onSave({
        nombre: nombre.trim(),
        rol,
        activo,
        pin: pinTocado || !esEdicion ? pin : undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" /> {esEdicion ? "Editar usuario" : "Nuevo usuario"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" autoFocus />
            {nombreInvalido && <p className="mt-1 text-xs text-destructive">El nombre es obligatorio</p>}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Rol</Label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as UserRol)}
              className="border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="cajero">Cajero (solo Punto de Venta)</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">
                {esEdicion ? "Nuevo PIN (opcional)" : "PIN (4 dígitos)"}
              </Label>
              <Input
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric" maxLength={4} className="rounded-xl"
                placeholder={esEdicion ? "Dejar en blanco" : "0000"}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Confirmar PIN</Label>
              <Input
                value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric" maxLength={4} className="rounded-xl"
              />
            </div>
          </div>
          {pinInvalido && pinTocado && (
            <p className="text-xs text-destructive">El PIN debe tener 4 dígitos y coincidir en ambos campos</p>
          )}

          {esEdicion && (
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Activo</span>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={saving || !puedeGuardar} onClick={handleGuardar}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
