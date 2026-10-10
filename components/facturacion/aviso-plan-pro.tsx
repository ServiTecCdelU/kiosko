"use client";

// components/facturacion/aviso-plan-pro.tsx — la facturacion electronica es del
// plan Pro (decidido 2026-10-10). Un comercio en Basico ve la pantalla con el
// modal de plan Pro encima y, detras, una tarjeta bloqueada con el mismo aviso
// (por si cierra el modal). La tarjeta de Mercado Pago de abajo muestra su propio
// bloqueo (tambien es del Pro).
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FUNCIONES_PRO, ModalPlanPro } from "@/components/plan/modal-plan-pro";

export function AvisoPlanPro() {
  const [abierto, setAbierto] = useState(true);
  const info = FUNCIONES_PRO.facturacion;
  return (
    <>
      <ModalPlanPro funcion={abierto ? "facturacion" : null} onOpenChange={setAbierto} />

      <section className="card-premium rounded-2xl p-5" aria-labelledby="plan-pro-titulo">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="plan-pro-titulo" className="font-semibold text-foreground">Facturación electrónica AFIP/ARCA</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary">
                <Lock className="h-3 w-3" /> Plan Pro
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{info.descripcion}</p>
            <p className="mt-2 text-sm text-muted-foreground">Está incluida en el plan Pro. Tu comercio está en el plan Básico.</p>
            <Button className="mt-3 rounded-2xl" size="sm" asChild>
              <Link href="/suscripcion">Pasar al plan Pro <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
