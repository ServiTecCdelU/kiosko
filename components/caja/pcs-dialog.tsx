"use client";

// components/caja/pcs-dialog.tsx — PCs registradas (solo el dueño).
// "Registrar esta PC": la ata a una caja; desde ahi los empleados entran con
// su PIN en ella. "Quitar": el PIN deja de funcionar en esa PC al instante
// (por ejemplo, si la roban o se cambia de lugar).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/format";
import { listarPcs, quitarPc, registrarEstaPc, type PcRegistrada } from "@/services/dispositivo-service";
import type { PuestoConEstado } from "@/services/caja-service";

interface PcsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puestos: PuestoConEstado[];
}

export function PcsDialog({ open, onOpenChange, puestos }: PcsDialogProps) {
  const [pcs, setPcs] = useState<PcRegistrada[] | null>(null);
  const [puestoId, setPuestoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aQuitar, setAQuitar] = useState<string | null>(null);

  const activos = puestos.filter((p) => p.activo);
  const esta = pcs?.find((p) => p.esEsta);

  const cargar = useCallback(async () => {
    try {
      setPcs(await listarPcs());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar las PCs");
    }
  }, []);

  useEffect(() => {
    if (open) cargar();
  }, [open, cargar]);

  useEffect(() => {
    setPuestoId(esta?.puestoId ?? (activos.length === 1 ? activos[0].id : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esta?.puestoId, activos.length]);

  const registrar = async () => {
    setGuardando(true);
    try {
      await registrarEstaPc(puestoId, nombre);
      const caja = activos.find((p) => p.id === puestoId)?.nombre ?? "la caja";
      toast.success(`Listo: esta PC es ${caja}. Los empleados ya pueden entrar con su PIN acá.`);
      setNombre("");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la PC");
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id: string) => {
    try {
      await quitarPc(id);
      toast.success("PC quitada: ya no se puede entrar con PIN en ella");
      setAQuitar(null);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar la PC");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Laptop className="h-4 w-4 text-primary" /> PCs del mostrador</DialogTitle>
          <DialogDescription>
            Los empleados solo pueden entrar con su PIN en una PC registrada, y entran directo a la caja de esa PC.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-semibold">Esta PC</p>
          {esta && (
            <p className="text-sm text-muted-foreground">
              Registrada como <b className="text-foreground">{esta.puestoNombre}</b> ({esta.nombre}). Podés cambiarla de caja:
            </p>
          )}
          {activos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Primero creá una caja en “Puestos…”.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={puestoId}
                onChange={(e) => setPuestoId(e.target.value)}
                className="h-9 rounded-xl border bg-transparent px-2 text-sm"
                aria-label="Caja de esta PC"
              >
                <option value="">Elegí la caja…</option>
                {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={esta?.nombre ?? "Nombre (ej. PC mostrador)"}
                className="h-9 rounded-xl"
                maxLength={60}
              />
              <Button className="h-9 shrink-0 rounded-xl" disabled={!puestoId || guardando} onClick={registrar}>
                {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {esta ? "Guardar" : "Registrar esta PC"}
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold">PCs registradas</p>
          {pcs === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : pcs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay PCs registradas.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {pcs.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.puestoNombre} · {p.nombre}{" "}
                      {p.esEsta && <Badge variant="outline" className="ml-1 border-primary text-primary">esta PC</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.ultimoUso ? `Último ingreso: ${formatDateTime(new Date(p.ultimoUso))}` : "Sin ingresos todavía"}
                    </p>
                  </div>
                  {aQuitar === p.id ? (
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="destructive" className="h-7 rounded-lg" onClick={() => quitar(p.id)}>Sí, quitar</Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => setAQuitar(null)}>No</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 rounded-lg text-muted-foreground" onClick={() => setAQuitar(p.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Quitar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
