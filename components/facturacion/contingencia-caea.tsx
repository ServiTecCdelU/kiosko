"use client";

// components/facturacion/contingencia-caea.tsx — contingencia CAEA: interruptor,
// CAEA de la quincena actual y la siguiente, pedido a mano, comprobantes CAEA
// pendientes de informar a AFIP. Solo con la facturacion activa.
// Spec: docs/superpowers/specs/2026-10-10-caea-design.md
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, LifeBuoy, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { claveQuincena, sePuedePedir, textoQuincena } from "@/lib/afip/caea";
import { NOMBRE_CBTE } from "@/lib/afip/constantes";
import { numeroComprobante } from "@/lib/afip/comprobante";
import { accionCaea, getCaea, setCaeaActivo, type EstadoCaea, type EstadoConfigAfip } from "@/services/facturacion-service";

function dia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function ContingenciaCaea({ onEstado }: { onEstado?: (e: EstadoConfigAfip) => void }) {
  const [estado, setEstado] = useState<EstadoCaea | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(() => {
    getCaea().then(setEstado).catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar"));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!estado || !estado.configurado || estado.demo) return null;

  const alternar = async (activo: boolean) => {
    setOcupado("activo");
    try {
      const r = await setCaeaActivo(activo);
      setEstado(r.caea);
      onEstado?.(r.estado);
      toast.success(activo ? "Contingencia activada: el sistema va a pedir los CAEA solo" : "Contingencia desactivada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(null);
    }
  };

  const correr = async (clave: string, body: Record<string, unknown>) => {
    setOcupado(clave);
    try {
      const r = await accionCaea(body);
      setEstado(r.caea);
      toast.success(r.mensaje);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setOcupado(null);
    }
  };

  const caeaDe = (q: { periodo: string; orden: number }) => estado.caeas.find((c) => c.periodo === q.periodo && c.orden === q.orden);
  const hoy = estado.hoy ?? "";

  return (
    <section className="card-premium rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight"><LifeBuoy className="h-5 w-5 text-primary" /> Contingencia (CAEA)</h2>
          <p className="text-sm text-muted-foreground">
            Si ARCA se cae, la factura sale igual con un código que se pide por adelantado cada quincena. Después, el
            sistema la informa a ARCA solo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={estado.caeaActivo} disabled={ocupado === "activo"} onCheckedChange={alternar} /> Usar contingencia
        </label>
      </div>

      {estado.caeaActivo && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {estado.quincenas.map((q) => {
              const c = caeaDe(q);
              return (
                <div key={claveQuincena(q)} className="rounded-xl border p-3 text-sm">
                  <p className="font-semibold">{textoQuincena(q)}</p>
                  {c ? (
                    <>
                      <p className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-4 w-4" /> CAEA {c.caea}</p>
                      <p className="text-xs text-muted-foreground">Vigente del {dia(c.vigDesde)} al {dia(c.vigHasta)} · informar hasta el {dia(c.fchTopeInf)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {sePuedePedir(q, hoy) ? "Todavía no se pidió." : "Se puede pedir desde 5 días antes de que empiece."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" disabled={!!ocupado} onClick={() => correr("pedir", { accion: "pedirFaltantes" })}>
              {ocupado === "pedir" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Pedir los CAEA que falten
            </Button>
            {estado.pendientes.length > 0 && (
              <Button className="rounded-xl" disabled={!!ocupado} onClick={() => correr("informar", { accion: "informar" })}>
                {ocupado === "informar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Informar {estado.pendientes.length} a ARCA
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            El sistema pide los CAEA e informa los comprobantes solo, cada vez que una factura normal sale bien. Estos
            botones son para no esperar.
          </p>

          {estado.pendientes.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold">Comprobantes emitidos con CAEA sin informar</p>
              <ul className="divide-y rounded-xl border text-sm">
                {estado.pendientes.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {NOMBRE_CBTE[p.cbte_tipo]} {numeroComprobante(p.punto_venta, p.numero)} · {dia(p.fecha)}
                      <span className="cifra ml-2 text-muted-foreground">{formatCurrency(p.total)}</span>
                    </span>
                    <Badge variant="outline" className={cn(p.caea_error ? "border-destructive/50 text-destructive" : "border-warning text-warning")} title={p.caea_error ?? ""}>
                      {p.caea_error ? "rechazado" : "pendiente"}
                    </Badge>
                    {p.caea_error && <p className="w-full text-xs text-destructive">{p.caea_error}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
