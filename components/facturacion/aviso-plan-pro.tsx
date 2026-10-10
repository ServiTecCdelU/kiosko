"use client";

// components/facturacion/aviso-plan-pro.tsx — la facturacion electronica es del
// plan Pro (decidido 2026-10-10). Un comercio en Basico ve la pantalla con un
// modal encima que lo manda a Suscripcion, y detras una tarjeta bloqueada con el
// mismo aviso (por si cierra el modal). Los cobros con Mercado Pago siguen
// disponibles en Basico: no se tapan.
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const QUE_INCLUYE = "Factura A, B y C de ARCA con CAE y QR, notas de crédito y facturación automática desde el punto de venta.";

export function AvisoPlanPro() {
  const [abierto, setAbierto] = useState(true);
  return (
    <>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> Facturación electrónica: plan Pro
            </DialogTitle>
            <DialogDescription>
              Tu comercio está en el plan Básico. {QUE_INCLUYE} Pasá a Pro desde Suscripción: el cambio aplica al instante y podés
              volver a Básico cuando quieras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="rounded-2xl" onClick={() => setAbierto(false)}>Ahora no</Button>
            <Button className="rounded-2xl" asChild>
              <Link href="/suscripcion">Pasar al plan Pro <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <p className="mt-1 text-sm text-muted-foreground">{QUE_INCLUYE}</p>
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
