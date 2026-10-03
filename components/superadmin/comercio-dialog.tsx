"use client";
// components/superadmin/comercio-dialog.tsx — "Administrar" un comercio:
// estado, plan, pago del mes y correos con acceso de Google.
import { toast } from "sonner";
import { useState } from "react";
import { Check, CircleDollarSign, Download, Loader2, LogIn } from "lucide-react";
import { descargarBackupDeComercio } from "@/services/backup-service";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { AccesosGoogle } from "@/components/superadmin/accesos-google";
import { nombreRubro, pagoAlDia, superadminApi, whatsappDe, type Comercio } from "@/components/superadmin/comun";
import { DIAS_GRACIA } from "@/lib/acceso-comercio";

interface ComercioDialogProps {
  comercio: Comercio | null;
  onOpenChange: (open: boolean) => void;
  onCambio: () => Promise<void>;
  onEntrar: (c: Comercio) => void;
}

const selectClase = "border-input h-9 w-full rounded-xl border bg-transparent px-2 text-sm outline-none";

const DIAS_EXTENSION = 7;

/** "AAAA-MM-DD" de una fecha en horario argentino (para el input type=date). */
function diaArgentina(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso));
}

/** Fin del dia elegido en Argentina (UTC-3 todo el año), en ISO. */
function finDelDiaArgentina(dia: string): string {
  return new Date(`${dia}T23:59:59-03:00`).toISOString();
}

/**
 * Fin de la prueba. Al vencer hay DIAS_GRACIA dias de uso normal y despues el
 * comercio queda en modo consulta (lib/acceso-comercio.ts). Extender desde
 * hoy si ya estaba vencida, asi la extension no se "gasta" en dias pasados.
 */
function FinDePrueba({ trialHasta, onCambiar }: { trialHasta: string | null; onCambiar: (iso: string) => void }) {
  const extender = () => {
    const base = Math.max(Date.now(), trialHasta ? new Date(trialHasta).getTime() : 0);
    onCambiar(finDelDiaArgentina(diaArgentina(new Date(base + DIAS_EXTENSION * 86_400_000).toISOString())));
  };

  return (
    <div>
      <Label htmlFor="fin-prueba" className="mb-1 block text-xs text-muted-foreground">
        Prueba hasta (después: {DIAS_GRACIA} días de gracia y modo consulta)
      </Label>
      <div className="flex gap-2">
        <input
          id="fin-prueba"
          type="date"
          value={trialHasta ? diaArgentina(trialHasta) : ""}
          onChange={(e) => e.target.value && onCambiar(finDelDiaArgentina(e.target.value))}
          className={selectClase}
        />
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 rounded-xl" onClick={extender}>
          +{DIAS_EXTENSION} días
        </Button>
      </div>
    </div>
  );
}

/** Excel con todos los datos del comercio (lib/server/backup.ts). */
function BotonBackup({ comercioId }: { comercioId: string }) {
  const [descargando, setDescargando] = useState(false);

  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarBackupDeComercio(comercioId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar el backup");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Button variant="outline" className="rounded-xl" onClick={descargar} disabled={descargando}>
      {descargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      Backup
    </Button>
  );
}

export function ComercioDialog({ comercio, onOpenChange, onCambio, onEntrar }: ComercioDialogProps) {
  if (!comercio) return null;
  const alDia = pagoAlDia(comercio);
  const rubro = nombreRubro(comercio.config?.rubro);
  const whatsapp = whatsappDe(comercio.config?.telefono);

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
          {(rubro || whatsapp) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {comercio.config?.origen === "autoregistro" && <span>Se dio de alta solo</span>}
              {rubro && <span>Rubro: <b className="text-foreground">{rubro}</b></span>}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  WhatsApp {comercio.config?.telefono}
                </a>
              )}
            </p>
          )}
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

          {comercio.estado === "prueba" && (
            <FinDePrueba
              trialHasta={comercio.trial_hasta}
              onCambiar={(trialHasta) => cambiar({ trialHasta })}
            />
          )}

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

          <div className="flex flex-col gap-2 sm:flex-row">
            <BotonBackup comercioId={comercio.id} />
            <Button className="flex-1 rounded-xl" onClick={() => onEntrar(comercio)}>
              <LogIn className="mr-2 h-4 w-4" /> Entrar al panel de {comercio.nombre}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
