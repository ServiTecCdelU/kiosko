"use client";

// components/caja/pcs-dialog.tsx — PCs registradas (solo el dueño).
// "Registrar esta PC": la ata a una caja; desde ahi los empleados entran con
// su PIN en ella. "Quitar": el PIN deja de funcionar en esa PC al instante
// (por ejemplo, si la roban o se cambia de lugar).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CheckCircle2, Laptop, Loader2, LogOut, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/format";
import { listarPcs, quitarPc, registrarEstaPc, type PcRegistrada } from "@/services/dispositivo-service";
import type { PuestoConEstado } from "@/services/caja-service";
import { useAuth } from "@/hooks/use-auth";

interface PcsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puestos: PuestoConEstado[];
  /** Avisa a la pantalla que cambiaron las PCs (la guia de empleados se vuelve a tildar). */
  onChanged?: () => void;
}

export function PcsDialog({ open, onOpenChange, puestos, onChanged }: PcsDialogProps) {
  const router = useRouter();
  const { logout } = useAuth();
  // Recien registrada: se muestra el paso siguiente (cerrar sesion para que entre el empleado).
  const [recienRegistrada, setRecienRegistrada] = useState<string | null>(null);
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
    if (!open) return;
    setRecienRegistrada(null);
    cargar();
  }, [open, cargar]);

  const salirParaEmpleado = () => {
    logout();
    router.push("/login");
  };

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
      setRecienRegistrada(caja);
      await cargar();
      onChanged?.();
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
      onChanged?.();
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

        <ol className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground [&_b]:text-foreground">
          <li><b>1.</b> Hacé esto <b>sentado en la computadora donde cobra el empleado</b>, no desde tu celular ni desde tu casa: se registra la PC en la que estás ahora.</li>
          <li><b>2.</b> Elegí a qué caja corresponde y tocá <b>Registrar esta PC</b>. Se hace una sola vez por PC.</li>
          <li><b>3.</b> Cerrá tu sesión. El empleado toca <b>“Soy empleado”</b> y pone su PIN: entra directo a esa caja.</li>
        </ol>

        {recienRegistrada && (
          <section className="space-y-2 rounded-xl border border-success/40 bg-success/10 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-success" /> Esta PC ya es {recienRegistrada}
            </p>
            <p className="text-xs text-muted-foreground">
              Último paso: cerrá tu sesión para que el empleado entre acá con “Soy empleado” y su PIN.
            </p>
            <Button size="sm" className="rounded-xl" onClick={salirParaEmpleado}>
              <LogOut className="mr-1.5 h-4 w-4" /> Cerrar mi sesión para que entre el empleado
            </Button>
          </section>
        )}

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
