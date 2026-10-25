"use client";

// app/suscripcion/page.tsx — la suscripcion del comercio (solo admin): plan,
// vencimiento, pago con Mercado Pago e historial completo.
import { CircleDollarSign } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AvisoVersionPaga, useEsDemo } from "@/components/home/aviso-version-paga";
import { SuscripcionCard } from "@/components/home/suscripcion-card";
import { useAuth } from "@/hooks/use-auth";

export default function SuscripcionPage() {
  return (
    <AuthGuard>
      <Contenido />
    </AuthGuard>
  );
}

function Contenido() {
  const esDemo = useEsDemo();
  const { rol } = useAuth();
  return (
    <AppShell title="Suscripción">
      <div className="mx-auto max-w-3xl">
        {esDemo ? (
          <AvisoVersionPaga icono={CircleDollarSign} titulo="Suscripción" descripcion="En la versión paga, acá se ve el plan, hasta cuándo está pagado y se paga el mes con Mercado Pago." />
        ) : rol !== "admin" ? (
          <p className="text-sm text-muted-foreground">La suscripción la administra el dueño del comercio.</p>
        ) : (
          <SuscripcionCard completa />
        )}
      </div>
    </AppShell>
  );
}
