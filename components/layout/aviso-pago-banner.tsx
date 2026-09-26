"use client";

// components/layout/aviso-pago-banner.tsx — cartel de aviso de pago mensual
// (dia 7 al 10), visible solo para el admin del comercio. Ver app/api/pago-mensual.
import { useEffect, useState } from "react";
import { CircleDollarSign, X } from "lucide-react";
import { apiUrl } from "@/lib/utils/api-url";

export function AvisoPagoBanner({ rol }: { rol: string | null }) {
  const [mostrar, setMostrar] = useState(false);
  const [diaLimite, setDiaLimite] = useState(10);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (rol !== "admin") return;
    fetch(apiUrl("/api/pago-mensual"))
      .then((r) => r.json())
      .then((d) => {
        setMostrar(!!d.mostrarAviso);
        setDiaLimite(d.diaLimite ?? 10);
      })
      .catch(() => {});
  }, [rol]);

  if (rol !== "admin" || !mostrar || cerrado) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning sm:px-6">
      <span className="flex items-center gap-2">
        <CircleDollarSign className="h-4 w-4 shrink-0" />
        El pago de este mes vence el día {diaLimite}. Regularizá tu suscripción para evitar interrupciones.
      </span>
      <button onClick={() => setCerrado(true)} className="shrink-0 text-warning/70 hover:text-warning" aria-label="Cerrar aviso">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
