"use client";
// components/superadmin/comercio-dialog.tsx — "Administrar" un comercio:
// estado, plan, suscripcion (pagos y pago manual) y correos con acceso de Google.
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock, Check, CircleDollarSign, Download, Loader2, LogIn, Mail, MessageCircle, RefreshCcw, Store, type LucideIcon,
} from "lucide-react";
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
import {
  DEBITO_LABEL, ESTADO_LABEL, ESTADO_PUNTO, PLAN_CLASE, PLAN_LABEL, avisoAcceso, nombreRubro, pagoAlDia, superadminApi, whatsappDe,
  type Comercio, type DebitoSaas, type FichaComercio, type GrupoSaas, type PreciosPlan,
} from "@/components/superadmin/comun";
import { DIAS_GRACIA, DIAS_GRACIA_PAGO } from "@/lib/acceso-comercio";
import { coberturaDelPago, METODO_PAGO_LABEL, textoPeriodo } from "@/lib/suscripcion";

interface ComercioDialogProps {
  comercio: Comercio | null;
  grupos: GrupoSaas[];
  precios?: PreciosPlan;
  onOpenChange: (open: boolean) => void;
  onCambio: () => Promise<void>;
  onEntrar: (c: Comercio) => void;
}

/** Bloque del dialogo: icono, titulo, explicacion corta y contenido. */
function Seccion({ icono: Icono, titulo, descripcion, extra, children }: {
  icono: LucideIcon; titulo: string; descripcion?: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-xl border bg-card/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Icono className="h-4 w-4 text-primary" /> {titulo}
          </p>
          {descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
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
    <Seccion
      icono={Store}
      titulo="Sucursales (mismo dueño)"
      descripcion="Las sucursales de un grupo pagan con descuento, salvo la más antigua, que paga completo. Cada sucursal sigue siendo un comercio aparte."
    >
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
    </Seccion>
  );
}

const selectClase = "border-input h-9 w-full rounded-xl border bg-transparent px-2 text-sm outline-none";

function Dato({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div>
      <p className="cifra text-lg font-semibold leading-tight">{valor.toLocaleString("es-AR")}</p>
      <p className="text-[11px] text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

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
    <Seccion
      icono={CalendarClock}
      titulo="Período de prueba"
      descripcion={`Al vencer tiene ${DIAS_GRACIA} días de gracia y después queda en modo consulta.`}
    >
      <div className="flex gap-2">
        <input
          id="fin-prueba"
          type="date"
          aria-label="Prueba hasta"
          value={trialHasta ? diaArgentina(trialHasta) : ""}
          onChange={(e) => e.target.value && onCambiar(finDelDiaArgentina(e.target.value))}
          className={selectClase}
        />
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 rounded-xl" onClick={extender}>
          +{DIAS_EXTENSION} días
        </Button>
      </div>
    </Seccion>
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

/** Debito automatico de Mercado Pago (saas_debitos), tal como lo ve el dueño en su Suscripcion. */
function DebitoAutomatico({ debito }: { debito: DebitoSaas | null }) {
  if (!debito) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <RefreshCcw className="h-3.5 w-3.5 shrink-0" /> Nunca activó el débito automático de Mercado Pago: paga mes a mes (link o manual).
      </div>
    );
  }
  const info = DEBITO_LABEL[debito.estado];
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", debito.estado === "authorized" ? "border-success/40 bg-success/5" : "bg-muted/30")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant="outline" className={cn("gap-1", info.clase)}><RefreshCcw className="h-3 w-3" /> {info.texto}</Badge>
        <span className="text-muted-foreground">{info.titulo}.</span>
      </p>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        {debito.estado !== "cancelled" && <span>Cobra <b className="cifra text-foreground">{formatCurrency(debito.monto)}</b> por mes</span>}
        {debito.proximoCobro && debito.estado === "authorized" && <span>Próximo cobro: <b className="text-foreground">{formatDate(debito.proximoCobro)}</b></span>}
        {debito.payerEmail && <span>Cuenta MP: <b className="text-foreground">{debito.payerEmail}</b></span>}
        <span>Activado el {formatDate(debito.creadoAt)}</span>
        {debito.canceladoAt && <span>Cancelado el {formatDate(debito.canceladoAt)}</span>}
      </p>
    </div>
  );
}

/** Suscripcion: cuanto paga, debito automatico, historial y pago manual (billing, 49). */
function Suscripcion({ comercio, ficha, onCambio }: { comercio: Comercio; ficha: FichaComercio | null; onCambio: () => Promise<void> }) {
  const [nota, setNota] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const alDia = pagoAlDia(comercio);
  const proximo = coberturaDelPago(comercio.suscripcion_hasta);
  const pagos = ficha?.pagos ?? null;
  const pagado = (pagos ?? []).filter((p) => p.estado === "aprobado").reduce((s, p) => s + p.monto, 0);

  const registrar = async () => {
    setRegistrando(true);
    try {
      const r = await superadminApi<{ periodo: string }>({ accion: "marcarPago", id: comercio.id, nota });
      toast.success(`Pago registrado: cubre ${textoPeriodo(r.periodo)}`);
      setNota("");
      await onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <Seccion
      icono={CircleDollarSign}
      titulo="Suscripción"
      descripcion={`El próximo pago cubre ${textoPeriodo(proximo.periodo)}. Un comercio activo con plan con precio y fecha vencida tiene ${DIAS_GRACIA_PAGO} días de gracia y después queda en modo consulta. Sin fecha no se bloquea nunca.`}
      extra={
        <Badge variant="outline" className={cn("shrink-0", alDia ? "border-success/50 text-success" : "border-warning text-warning")}>
          {alDia ? <Check className="mr-1 h-3 w-3" /> : <CircleDollarSign className="mr-1 h-3 w-3" />}
          {comercio.suscripcion_hasta ? `Pagada hasta el ${formatDate(comercio.suscripcion_hasta)}` : "Sin fecha de pago"}
        </Badge>
      }
    >
      {ficha ? (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-center">
          <div>
            <p className="cifra text-base font-semibold leading-tight">{formatCurrency(ficha.monto.total)}</p>
            <p className="text-[11px] text-muted-foreground">
              por mes · {ficha.nombrePlan}
              {ficha.monto.cajasExtra > 0 && <> + {ficha.monto.cajasExtra} caja{ficha.monto.cajasExtra === 1 ? "" : "s"} extra</>}
              {ficha.monto.descuento > 0 && <> − {ficha.monto.descuentoPct}% sucursal</>}
            </p>
          </div>
          <div>
            <p className="cifra text-base font-semibold leading-tight">{formatCurrency(pagado)}</p>
            <p className="text-[11px] text-muted-foreground">pagado en total ({(pagos ?? []).filter((p) => p.estado === "aprobado").length} pagos)</p>
          </div>
          <div>
            <p className="cifra text-base font-semibold leading-tight">{ficha.cajasActivas}</p>
            <p className="text-[11px] text-muted-foreground">caja{ficha.cajasActivas === 1 ? "" : "s"} activa{ficha.cajasActivas === 1 ? "" : "s"}</p>
          </div>
        </div>
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}

      {ficha && <DebitoAutomatico debito={ficha.debito} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (ej. transferencia, efectivo)" className="h-9 rounded-xl" maxLength={120} />
        <Button size="sm" variant="outline" className="h-9 shrink-0 rounded-xl" disabled={registrando} onClick={registrar}>
          {registrando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CircleDollarSign className="mr-1.5 h-4 w-4" />}
          Registrar pago manual
        </Button>
      </div>
      {pagos === null ? null : pagos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no registró ningún pago.</p>
      ) : (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border text-xs">
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
    </Seccion>
  );
}

export function ComercioDialog({ comercio, ...resto }: ComercioDialogProps) {
  if (!comercio) return null;
  return <Contenido key={comercio.id} comercio={comercio} {...resto} />;
}

function Contenido({ comercio, grupos, precios = {}, onOpenChange, onCambio, onEntrar }: ComercioDialogProps & { comercio: Comercio }) {
  const rubro = nombreRubro(comercio.config?.rubro);
  const whatsapp = whatsappDe(comercio.config?.telefono);
  const aviso = avisoAcceso(comercio, precios);
  const [ficha, setFicha] = useState<FichaComercio | null>(null);

  // Correos, cuanto paga, debito automatico e historial: una sola consulta.
  const cargarFicha = useCallback(async () => {
    try {
      const r = await superadminApi<{ ficha: FichaComercio }>({ accion: "ficha", id: comercio.id });
      setFicha(r.ficha);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer la ficha del comercio");
    }
  }, [comercio.id]);

  useEffect(() => {
    cargarFicha();
  }, [cargarFicha]);

  const recargar = useCallback(async () => {
    await Promise.all([onCambio(), cargarFicha()]);
  }, [onCambio, cargarFicha]);

  const cambiar = async (cambios: Record<string, unknown>) => {
    try {
      await superadminApi({ id: comercio.id, ...cambios }, "PATCH");
      toast.success("Comercio actualizado");
      await recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="grad-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white">
              {comercio.nombre.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{comercio.nombre}</DialogTitle>
              <DialogDescription>
                /{comercio.slug} · desde {formatDate(comercio.created_at)}
                {comercio.config?.origen === "autoregistro" && " · se dio de alta solo"}
              </DialogDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="outline" className="gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", ESTADO_PUNTO[comercio.estado])} />
              {ESTADO_LABEL[comercio.estado]}
            </Badge>
            <Badge variant="outline" className={PLAN_CLASE[comercio.plan]}>Plan {PLAN_LABEL[comercio.plan]}</Badge>
            {aviso && <Badge variant="outline" className={aviso.clase} title={aviso.titulo}>{aviso.texto}</Badge>}
            {rubro && <Badge variant="outline" className="text-muted-foreground">{rubro}</Badge>}
            {whatsapp && (
              <a
                href={whatsapp} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-[22px] items-center gap-1 rounded-md border border-success/50 px-2 text-xs font-medium text-success hover:bg-success/10"
              >
                <MessageCircle className="h-3 w-3" /> {comercio.config?.telefono}
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            {!ficha ? (
              <span className="text-muted-foreground">Cargando correos…</span>
            ) : ficha.correos.length === 0 ? (
              <span className="text-destructive">Nadie puede entrar con Google</span>
            ) : (
              ficha.correos.map((c) => (
                <a
                  key={c.email} href={`mailto:${c.email}`} title={c.nombre || undefined}
                  className="rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-foreground hover:bg-muted hover:underline"
                >
                  {c.email}
                </a>
              ))
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card/40 p-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Estado</Label>
              <select value={comercio.estado} onChange={(e) => cambiar({ estado: e.target.value })} className={selectClase}>
                <option value="prueba">En prueba</option>
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
            <div className="col-span-2 grid grid-cols-3 gap-2 border-t pt-3 text-center">
              <Dato valor={comercio.uso.productos} etiqueta="productos" />
              <Dato valor={comercio.uso.ventas} etiqueta="ventas" />
              <Dato valor={comercio.uso.usuarios} etiqueta="empleados" />
            </div>
          </div>

          {comercio.estado === "prueba" && (
            <FinDePrueba
              trialHasta={comercio.trial_hasta}
              onCambiar={(trialHasta) => cambiar({ trialHasta })}
            />
          )}

          <Suscripcion comercio={comercio} ficha={ficha} onCambio={recargar} />

          <Sucursales comercio={comercio} grupos={grupos} onCambiar={cambiar} onGruposCambiados={onCambio} />

          <Seccion
            icono={Mail}
            titulo="Acceso con Google"
            descripcion="Estos correos entran como administradores de este comercio con el botón “Entrar con Google”."
          >
            <AccesosGoogle comercioId={comercio.id} onCambio={recargar} />
          </Seccion>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
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
