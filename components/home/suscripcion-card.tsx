"use client";

// components/home/suscripcion-card.tsx — la suscripcion del comercio: plan,
// hasta cuando esta pagada, pagar con Mercado Pago e historial. Se usa en el
// inicio (resumida) y en /suscripcion (completa). Solo admin.
// Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CircleDollarSign, Clock, ExternalLink, Loader2, MessageCircle, RefreshCw, Repeat, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { CONTACT } from "@/lib/marketing/contact";
import { trackWhatsAppClick } from "@/lib/analytics";
import { METODO_PAGO_LABEL, textoPeriodo } from "@/lib/suscripcion";
import { activarDebito, cancelarDebito, crearLinkDePago, getSuscripcion, type EstadoSuscripcion } from "@/services/billing-service";

function situacion(s: EstadoSuscripcion): { texto: string; clase: string; icono: typeof Check } {
  if (s.precioMensual <= 0) return { texto: "Sin cargo", clase: "border-success/50 text-success", icono: Check };
  if (!s.suscripcionHasta) return { texto: "Sin vencimiento cargado", clase: "border-muted-foreground text-muted-foreground", icono: Clock };
  const dias = Math.ceil((new Date(s.suscripcionHasta).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return { texto: `Vencida el ${formatDate(s.suscripcionHasta)}`, clase: "border-destructive/50 text-destructive", icono: CircleDollarSign };
  if (dias <= 5) return { texto: `Vence en ${dias} día${dias === 1 ? "" : "s"}`, clase: "border-warning text-warning", icono: Clock };
  return { texto: `Pagada hasta el ${formatDate(s.suscripcionHasta)}`, clase: "border-success/50 text-success", icono: Check };
}

export function SuscripcionCard({ completa = false }: { completa?: boolean }) {
  const [estado, setEstado] = useState<EstadoSuscripcion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [debitando, setDebitando] = useState(false);

  const cargar = useCallback(async (confirmar = false) => {
    try {
      setEstado(await getSuscripcion(confirmar));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    // Volvio de Mercado Pago (?status=approved... o ?preapproval_id=...): se confirma por si el webhook no llego.
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const volvio = !!q && (q.has("status") || q.has("preapproval_id"));
    cargar(volvio);
  }, [cargar]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!estado) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (estado.demo) return null;

  const sit = situacion(estado);
  const Icono = sit.icono;
  const debito = estado.debito && estado.debito.estado !== "cancelled" ? estado.debito : null;
  const debitoActivo = debito?.estado === "authorized";
  // Con el debito autorizado no se ofrece el link mensual: se pagaria dos veces.
  const sePuedePagar = estado.monto.total > 0 && estado.mpDisponible && !debitoActivo;
  const sePuedeDebitar = estado.monto.total > 0 && estado.mpDisponible;

  const activar = async () => {
    setDebitando(true);
    try {
      const { initPoint } = await activarDebito();
      window.open(initPoint, "_blank", "noopener");
      toast.info("Se abrió Mercado Pago en otra pestaña. Autorizá el débito con tu tarjeta y volvé acá: se actualiza solo.");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo activar el débito automático");
    } finally {
      setDebitando(false);
    }
  };

  const cancelar = async () => {
    if (!window.confirm("¿Cancelar el débito automático? Lo que ya pagaste sigue vigente; después vas a tener que pagar cada mes con el link.")) return;
    setDebitando(true);
    try {
      await cancelarDebito();
      toast.success("Débito automático cancelado");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setDebitando(false);
    }
  };

  const pagar = async () => {
    setPagando(true);
    try {
      const { initPoint } = await crearLinkDePago();
      window.open(initPoint, "_blank", "noopener");
      toast.info("Se abrió Mercado Pago en otra pestaña. Cuando termines, volvé acá: la suscripción se actualiza sola.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo iniciar el pago");
    } finally {
      setPagando(false);
    }
  };

  const confirmar = async () => {
    setConfirmando(true);
    await cargar(true);
    setConfirmando(false);
  };

  const pagos = completa ? estado.pagos : estado.pagos.slice(0, 3);

  return (
    <section className="card-premium rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><CircleDollarSign className="h-4 w-4 text-primary" /> Suscripción</p>
          <p className="mt-1 text-lg font-semibold">
            Plan {estado.nombrePlan}
            {estado.monto.total > 0 && <span className="cifra ml-2 text-base font-normal text-muted-foreground">{formatCurrency(estado.monto.total)} por mes</span>}
          </p>
          {estado.monto.cajasExtra > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(estado.monto.base)} del plan + {estado.monto.cajasExtra} caja{estado.monto.cajasExtra === 1 ? "" : "s"} extra × {formatCurrency(estado.tarifa.precioCajaExtra)}
              {" "}({estado.monto.cajas} cajas activas, {estado.tarifa.cajasIncluidas} incluida{estado.tarifa.cajasIncluidas === 1 ? "" : "s"})
            </p>
          )}
          {estado.grupo && (
            <p className="text-xs text-muted-foreground">
              Sucursal del grupo {estado.grupo.nombre}:{" "}
              {estado.grupo.esPrincipal
                ? "es la principal y paga completo"
                : `${estado.grupo.descuentoPct}% de descuento (${formatCurrency(estado.monto.descuento)} menos por mes)`}
            </p>
          )}
          <Badge variant="outline" className={cn("mt-1", sit.clase)}><Icono className="mr-1 h-3 w-3" /> {sit.texto}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {sePuedePagar && (
            <Button className="rounded-2xl" disabled={pagando} onClick={pagar}>
              {pagando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Pagar {textoPeriodo(estado.proximo.periodo)} con Mercado Pago
            </Button>
          )}
          {estado.precioMensual > 0 && !estado.mpDisponible && (
            <Button variant="outline" className="rounded-2xl" asChild>
              <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsAppClick("suscripcion", { conversion: false })}><MessageCircle className="mr-2 h-4 w-4" /> Pagar por WhatsApp</a>
            </Button>
          )}
          {estado.pagos.some((p) => p.estado === "pendiente" && p.metodo === "mercadopago") && (
            <Button variant="ghost" className="rounded-2xl" disabled={confirmando} onClick={confirmar} title="Si ya pagaste y todavía figura pendiente">
              {confirmando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Ya pagué
            </Button>
          )}
        </div>
      </div>

      {sePuedePagar && (
        <p className="mt-2 text-xs text-muted-foreground">
          Cada pago cubre un mes: el próximo cubre {textoPeriodo(estado.proximo.periodo)} y deja la suscripción pagada hasta el {formatDate(estado.proximo.hasta)}.
          Si no pagás, 10 días después del vencimiento el sistema pasa a modo consulta (podés ver todo, pero no vender) hasta que pagues. Tus datos no se tocan.
        </p>
      )}

      {sePuedeDebitar && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <Repeat className={cn("mt-0.5 h-4 w-4 shrink-0", debitoActivo ? "text-success" : "text-muted-foreground")} />
            <div>
              {!debito && (
                <>
                  <p className="font-medium">Débito automático</p>
                  <p className="text-xs text-muted-foreground">Autorizás una vez con tu tarjeta en Mercado Pago y la suscripción se cobra sola cada mes. Lo podés cancelar cuando quieras.</p>
                </>
              )}
              {debito?.estado === "pending" && (
                <>
                  <p className="font-medium">Débito automático: falta autorizarlo</p>
                  <p className="text-xs text-muted-foreground">Terminá de autorizarlo en Mercado Pago. Hasta entonces podés seguir pagando con el link mensual.</p>
                </>
              )}
              {debito?.estado === "authorized" && (
                <>
                  <p className="font-medium text-success">Débito automático activo</p>
                  <p className="text-xs text-muted-foreground">
                    Mercado Pago cobra {formatCurrency(debito.monto)} por mes
                    {debito.proximoCobro && <> · próximo cobro el {formatDate(debito.proximoCobro)}</>}
                    {debito.payerEmail && <> · cuenta {debito.payerEmail}</>}.
                    Si cambian tus cajas o tu plan, el monto se actualiza solo.
                  </p>
                </>
              )}
              {debito?.estado === "paused" && (
                <>
                  <p className="font-medium text-warning">Débito automático pausado por Mercado Pago</p>
                  <p className="text-xs text-muted-foreground">No pudo cobrar (tarjeta rechazada o sin saldo). Mientras tanto pagá con el link mensual, o cancelalo y activalo de nuevo con otra tarjeta.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(!debito || debito.estado === "pending") && (
              <Button variant={debito ? "default" : "outline"} size="sm" className="rounded-2xl" disabled={debitando} onClick={activar}>
                {debitando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                {debito ? "Terminar de autorizar" : "Activar débito automático"}
              </Button>
            )}
            {debito && (
              <Button variant="ghost" size="sm" className="rounded-2xl" disabled={debitando} onClick={cancelar}>
                <XCircle className="mr-2 h-4 w-4" /> Cancelar débito
              </Button>
            )}
          </div>
        </div>
      )}

      {pagos.length > 0 && (
        <ul className="mt-3 divide-y rounded-xl border text-sm">
          {pagos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <b>{textoPeriodo(p.periodo)}</b>
                <span className="text-muted-foreground"> · {METODO_PAGO_LABEL[p.metodo]} · {formatDateTime(p.aprobadoAt ?? p.createdAt)}</span>
                {p.nota && <span className="text-muted-foreground"> · {p.nota}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="cifra">{formatCurrency(p.monto)}</span>
                <Badge variant="outline" className={cn(
                  p.estado === "aprobado" && "border-success/50 text-success",
                  p.estado === "pendiente" && "border-warning text-warning",
                  p.estado === "rechazado" && "border-destructive/50 text-destructive",
                )}>{p.estado}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!completa && estado.pagos.length > 3 && (
        <Link href="/suscripcion" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Ver todos los pagos</Link>
      )}
    </section>
  );
}
