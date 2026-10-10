"use client";
// components/superadmin/comercio-dialog.tsx — "Administrar" un comercio:
// estado, plan, suscripcion (pagos y pago manual) y correos con acceso de Google.
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { Check, CircleDollarSign, Download, Loader2, LogIn } from "lucide-react";
import { descargarBackupDeComercio } from "@/services/backup-service";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { AccesosGoogle } from "@/components/superadmin/accesos-google";
import { nombreRubro, pagoAlDia, superadminApi, whatsappDe, type Comercio, type GrupoSaas, type PagoSaas } from "@/components/superadmin/comun";
import { DIAS_GRACIA, DIAS_GRACIA_PAGO } from "@/lib/acceso-comercio";
import { coberturaDelPago, METODO_PAGO_LABEL, textoPeriodo } from "@/lib/suscripcion";

interface ComercioDialogProps {
  comercio: Comercio | null;
  grupos: GrupoSaas[];
  onOpenChange: (open: boolean) => void;
  onCambio: () => Promise<void>;
  onEntrar: (c: Comercio) => void;
}

/**
 * Sucursales (53): el comercio puede pertenecer a un grupo del mismo dueño. La
 * sucursal mas antigua del grupo paga completo; las demas, con el descuento.
 */
function Sucursales({ comercio, grupos, onCambiar, onGruposCambiados }: {
  comercio: Comercio; grupos: GrupoSaas[]; onCambiar: (c: Record<string, unknown>) => Promise<void>; onGruposCambiados: () => Promise<void>;
}) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descuento, setDescuento] = useState("20");
  const [guardando, setGuardando] = useState(false);
  const grupo = grupos.find((g) => g.id === comercio.grupo_id);

  const crear = async () => {
    setGuardando(true);
    try {
      const { grupo: nuevo } = await superadminApi<{ grupo: GrupoSaas }>({ accion: "guardarGrupo", nombre, descuentoPct: Number(descuento) || 0 });
      await onCambiar({ grupoId: nuevo.id });
      await onGruposCambiados();
      setCreando(false);
      setNombre("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el grupo");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarDescuento = async (valor: string) => {
    if (!grupo) return;
    const pct = Number(valor);
    if (!Number.isFinite(pct) || pct === grupo.descuentoPct) return;
    try {
      await superadminApi({ accion: "guardarGrupo", id: grupo.id, nombre: grupo.nombre, descuentoPct: pct });
      toast.success("Descuento del grupo actualizado");
      await onGruposCambiados();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Sucursales (mismo dueño)</p>
      <p className="text-xs text-muted-foreground">
        Las sucursales de un grupo pagan con descuento, salvo la más antigua, que paga completo. Cada sucursal sigue siendo un comercio aparte.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={comercio.grupo_id ?? ""}
          onChange={(e) => (e.target.value === "__nuevo__" ? setCreando(true) : onCambiar({ grupoId: e.target.value || null }))}
          className={selectClase}
        >
          <option value="">Sin grupo</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre} · {g.descuentoPct}% · {g.comercios ?? 0} comercio(s)</option>)}
          <option value="__nuevo__">+ Nuevo grupo…</option>
        </select>
        {grupo && (
          <div className="flex items-center gap-1.5 text-sm">
            <Input type="number" inputMode="decimal" min={0} max={100} defaultValue={grupo.descuentoPct} onBlur={(e) => cambiarDescuento(e.target.value)} className="h-9 w-20 rounded-xl text-right" aria-label="Descuento del grupo" />
            <span className="text-muted-foreground">% para las sucursales</span>
          </div>
        )}
      </div>
      {creando && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre del grupo (ej. el dueño)</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9 rounded-xl" autoFocus />
          </div>
          <div className="w-28">
            <Label className="mb-1 block text-xs text-muted-foreground">Descuento %</Label>
            <Input type="number" inputMode="decimal" min={0} max={100} value={descuento} onChange={(e) => setDescuento(e.target.value)} className="h-9 rounded-xl text-right" />
          </div>
          <Button size="sm" className="h-9 rounded-xl" disabled={guardando || !nombre.trim()} onClick={crear}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear y asignar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 rounded-xl" onClick={() => setCreando(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
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

/** Suscripcion: hasta cuando esta pagada, historial y pago manual (billing, 49). */
function Suscripcion({ comercio, onCambio }: { comercio: Comercio; onCambio: () => Promise<void> }) {
  const [pagos, setPagos] = useState<PagoSaas[] | null>(null);
  const [nota, setNota] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const alDia = pagoAlDia(comercio);
  const proximo = coberturaDelPago(comercio.suscripcion_hasta);

  const cargar = useCallback(() => {
    superadminApi<{ pagos: PagoSaas[] }>({ accion: "pagos", id: comercio.id })
      .then((r) => setPagos(r.pagos))
      .catch(() => setPagos([]));
  }, [comercio.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const registrar = async () => {
    setRegistrando(true);
    try {
      const r = await superadminApi<{ periodo: string }>({ accion: "marcarPago", id: comercio.id, nota });
      toast.success(`Pago registrado: cubre ${textoPeriodo(r.periodo)}`);
      setNota("");
      cargar();
      await onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Suscripción</p>
        <Badge variant="outline" className={cn(alDia ? "border-success/50 text-success" : "border-warning text-warning")}>
          {alDia ? <Check className="mr-1 h-3 w-3" /> : <CircleDollarSign className="mr-1 h-3 w-3" />}
          {comercio.suscripcion_hasta ? `Pagada hasta el ${formatDate(comercio.suscripcion_hasta)}` : "Sin fecha de pago"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        El próximo pago cubre {textoPeriodo(proximo.periodo)}. Un comercio activo con plan con precio y fecha vencida tiene
        {" "}{DIAS_GRACIA_PAGO} días de gracia y después queda en modo consulta. Sin fecha no se bloquea nunca.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (ej. transferencia, efectivo)" className="h-9 rounded-xl" maxLength={120} />
        <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl" disabled={registrando} onClick={registrar}>
          {registrando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CircleDollarSign className="mr-1.5 h-4 w-4" />}
          Registrar pago manual
        </Button>
      </div>
      {pagos === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : pagos.length > 0 && (
        <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border text-xs">
          {pagos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
              <span>
                <b>{textoPeriodo(p.periodo)}</b> · {METODO_PAGO_LABEL[p.metodo]} · {formatDateTime(p.aprobadoAt ?? p.createdAt)}
                {p.nota && ` · ${p.nota}`}{p.usuarioNombre && ` · ${p.usuarioNombre}`}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="cifra">{formatCurrency(p.monto)}</span>
                <Badge variant="outline" className={cn(
                  "h-5 px-1.5",
                  p.estado === "aprobado" && "border-success/50 text-success",
                  p.estado === "pendiente" && "border-warning text-warning",
                  p.estado === "rechazado" && "border-destructive/50 text-destructive",
                )}>{p.estado}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ComercioDialog({ comercio, grupos, onOpenChange, onCambio, onEntrar }: ComercioDialogProps) {
  if (!comercio) return null;
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

          <Suscripcion comercio={comercio} onCambio={onCambio} />

          <Sucursales comercio={comercio} grupos={grupos} onCambiar={cambiar} onGruposCambiados={onCambio} />

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
