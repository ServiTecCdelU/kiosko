"use client";

// components/plan/modal-plan-pro.tsx — modal "esto es del plan Pro" con boton a
// Suscripcion. Lo usan Facturacion, el lector Point de Mercado Pago y las cajas
// extra cuando el comercio esta en Basico (decidido 2026-10-10). El servidor
// valida igual (lib/server/plan.ts, errorAlSumarCaja): esto es solo el aviso.
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type FuncionPro = "facturacion" | "point" | "cajas";

export const FUNCIONES_PRO: Record<FuncionPro, { titulo: string; descripcion: string }> = {
  facturacion: {
    titulo: "Facturación electrónica: plan Pro",
    descripcion: "Factura A, B y C de ARCA con CAE y QR, notas de crédito y facturación automática desde el punto de venta.",
  },
  point: {
    titulo: "Lector Point de Mercado Pago: plan Pro",
    descripcion: "Mandás el cobro al lector Point desde el punto de venta y la venta se cierra sola cuando el cliente paga con tarjeta. El cobro con QR de Mercado Pago está en todos los planes.",
  },
  cajas: {
    titulo: "Varias cajas: plan Pro",
    descripcion: "El plan Básico incluye una caja. En Pro abrís todas las cajas que necesites, cada una con su apertura, cierre y arqueo; cada caja extra suma un costo mensual que ves en Suscripción.",
  },
};

interface ModalPlanProProps {
  funcion: FuncionPro | null;
  onOpenChange: (open: boolean) => void;
}

export function ModalPlanPro({ funcion, onOpenChange }: ModalPlanProProps) {
  const info = funcion ? FUNCIONES_PRO[funcion] : null;
  return (
    <Dialog open={!!funcion} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" /> {info?.titulo}
          </DialogTitle>
          <DialogDescription>
            Tu comercio está en el plan Básico. {info?.descripcion} Pasá a Pro desde Suscripción: el cambio aplica al instante y
            podés volver a Básico cuando quieras.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="rounded-2xl" onClick={() => onOpenChange(false)}>Ahora no</Button>
          <Button className="rounded-2xl" asChild>
            <Link href="/suscripcion">Pasar al plan Pro <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
