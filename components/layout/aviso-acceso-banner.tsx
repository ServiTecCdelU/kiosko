"use client";

// components/layout/aviso-acceso-banner.tsx — cartel de prueba por vencer, en
// gracia o modo consulta (prueba vencida, suspendido, baja). Lo ven todos los
// roles: el cajero tiene que saber por que no puede cobrar. El bloqueo real lo
// hace proxy.ts; reglas en lib/acceso-comercio.ts.
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Lock, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/utils/api-url";
import { formatDate } from "@/lib/utils/format";
import { CONTACT } from "@/lib/marketing/contact";
import type { EstadoAcceso } from "@/lib/acceso-comercio";

type Acceso = EstadoAcceso & { soporte?: boolean };

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function texto(a: Acceso, esAdmin: boolean): string {
  const fin = a.venceEl ? formatDate(a.venceEl) : "";
  const accion = esAdmin ? "Contratá un plan para seguir" : "Avisale al dueño del comercio";
  switch (a.motivo) {
    case "prueba_por_vencer":
      return `Te ${a.dias === 1 ? "queda" : "quedan"} ${plural(a.dias ?? 0, "día", "días")} de prueba (vence el ${fin}). ${accion} sin interrupciones.`;
    case "prueba_en_gracia":
      return `Tu prueba venció el ${fin}. En ${plural(a.dias ?? 0, "día", "días")} el sistema pasa a modo consulta y no se va a poder vender. ${accion}.`;
    case "prueba_vencida":
      return `Tu prueba terminó el ${fin}. El sistema está en modo consulta: podés ver y exportar todo, pero no vender ni editar. Tus datos están a salvo. ${accion}.`;
    case "suspendido":
      return "El comercio está suspendido. El sistema está en modo consulta: podés ver y exportar todo, pero no vender ni editar.";
    case "baja":
      return "El comercio está dado de baja. El sistema está en modo consulta.";
    default:
      return "";
  }
}

export function AvisoAccesoBanner({ rol }: { rol: string | null }) {
  const [acceso, setAcceso] = useState<Acceso | null>(null);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (!rol) return;
    fetch(apiUrl("/api/acceso"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAcceso(d))
      .catch(() => {});
  }, [rol]);

  if (!acceso || acceso.motivo === "ok") return null;

  const bloqueado = acceso.nivel === "solo_lectura";
  // El aviso previo se puede cerrar; la gracia y el bloqueo no.
  const cerrable = acceso.motivo === "prueba_por_vencer";
  if (cerrable && cerrado) return null;

  const Icono = bloqueado ? Lock : acceso.motivo === "prueba_en_gracia" ? AlertTriangle : Clock;

  return (
    <div
      role={bloqueado ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 border-b px-4 py-2.5 text-sm sm:items-center sm:px-6",
        cerrable ? "border-warning/40 bg-warning/10 text-warning" : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      <span className="flex items-start gap-2 sm:items-center">
        <Icono className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
        <span>
          {texto(acceso, rol === "admin")}
          {acceso.soporte && bloqueado && <b> (Modo soporte: podés operar igual.)</b>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {rol === "admin" && acceso.motivo !== "baja" && (
          <a
            href={CONTACT.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-xl border border-current/30 px-2.5 py-1 text-xs font-medium hover:bg-current/10"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
        {cerrable && (
          <button onClick={() => setCerrado(true)} className="opacity-70 hover:opacity-100" aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        )}
      </span>
    </div>
  );
}
