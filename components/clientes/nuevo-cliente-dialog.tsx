"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearCliente } from "@/services/clientes-service";
import type { Cliente } from "@/lib/types";

interface NuevoClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (cliente: Cliente) => void;
}

export function NuevoClienteDialog({ open, onOpenChange, onCreated }: NuevoClienteDialogProps) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [documento, setDocumento] = useState("");
  const [limite, setLimite] = useState("");
  const [notas, setNotas] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre("");
      setTelefono("");
      setDocumento("");
      setLimite("");
      setNotas("");
    }
  }, [open]);

  const handle = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setWorking(true);
    try {
      const cliente = await crearCliente({
        nombre,
        telefono,
        documento,
        limiteCredito: Number(limite) || 0,
        notas,
      });
      toast.success(`Cliente "${cliente.nombre}" creado`);
      onCreated(cliente);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *">
            <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" placeholder="Nombre y apellido" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="rounded-xl" inputMode="tel" />
            </Field>
            <Field label="Documento">
              <Input value={documento} onChange={(e) => setDocumento(e.target.value)} className="rounded-xl" />
            </Field>
          </div>
          <Field label="Límite de crédito (0 = sin límite)">
            <Input value={limite} onChange={(e) => setLimite(e.target.value)} className="rounded-xl" type="number" inputMode="decimal" />
          </Field>
          <Field label="Notas">
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} className="rounded-xl" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={working || !nombre.trim()} onClick={handle}>
            {working ? "Guardando..." : "Crear cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
