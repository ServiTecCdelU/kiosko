"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Phone, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { listarDeudores, type Deudor } from "@/services/clientes-service";

/** A partir de cuantos dias sin pagar la deuda se considera problematica. */
const DIAS_ALERTA = 30;
const DIAS_ATENCION = 15;

function antiguedad(d: Deudor): { texto: string; nivel: "ok" | "atencion" | "alerta" } {
  const dias = d.diasSinPagar;
  if (dias == null) return { texto: "sin movimientos", nivel: "ok" };

  const nivel = dias >= DIAS_ALERTA ? "alerta" : dias >= DIAS_ATENCION ? "atencion" : "ok";
  const cuando =
    dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;

  return { texto: d.nuncaPago ? `debe desde ${cuando}` : `pagó ${cuando}`, nivel };
}

export function DeudoresPanel({ onVerCliente }: { onVerCliente: (id: string) => void }) {
  const [deudores, setDeudores] = useState<Deudor[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const r = await listarDeudores();
      setDeudores(r.deudores);
      setTotal(r.totalPorCobrar);
    } catch {
      // Panel secundario: no rompe la pantalla de clientes.
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando || deudores.length === 0) return null;

  const atrasados = deudores.filter((d) => (d.diasSinPagar ?? 0) >= DIAS_ALERTA);

  return (
    <div className="card-premium mb-4 rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Deudores</h2>
        <p className="text-sm text-muted-foreground">
          {deudores.length} {deudores.length === 1 ? "cliente" : "clientes"} ·{" "}
          <span className="cifra font-semibold text-warning">{formatCurrency(total)}</span> por cobrar
        </p>
      </div>

      {atrasados.length > 0 && (
        <p className="mb-3 rounded-xl bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
          <strong>
            {atrasados.length === 1
              ? "1 cliente lleva más de un mes sin pagar"
              : `${atrasados.length} clientes llevan más de un mes sin pagar`}
          </strong>{" "}
          — suman {formatCurrency(atrasados.reduce((s, d) => s + d.saldo, 0))}.
        </p>
      )}

      {/* Ordenados por antiguedad: primero al que hace mas que no le cobras. */}
      <ul className="space-y-1">
        {deudores.map((d) => {
          const a = antiguedad(d);
          return (
            <li key={d.id}>
              <button
                onClick={() => onVerCliente(d.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {d.nombre}
                    {d.superaLimite && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" /> pasado del límite
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        a.nivel === "alerta" && "font-semibold text-destructive",
                        a.nivel === "atencion" && "text-warning",
                      )}
                    >
                      <Clock className="h-3 w-3" /> {a.texto}
                    </span>
                    {d.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {d.telefono}
                      </span>
                    )}
                  </p>
                </div>
                <span className="cifra font-semibold text-warning">{formatCurrency(d.saldo)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
