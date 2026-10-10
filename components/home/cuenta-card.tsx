"use client";

// components/home/cuenta-card.tsx — "Cuenta y suscripcion" en el inicio (admin):
// datos de la cuenta (comercio, direccion del panel, quien esta logueado) y la
// suscripcion (plan, hasta cuando esta pagada, pagar, historial).
import { Building2, Link2, UserRound } from "lucide-react";
import { getCurrentUser } from "@/hooks/use-auth";
import { SuscripcionCard } from "@/components/home/suscripcion-card";
import { useEsDemo } from "@/components/home/aviso-version-paga";

export function CuentaCard() {
  const user = getCurrentUser();
  const esDemo = useEsDemo();
  if (esDemo) return null;
  return (
    <section className="space-y-3" aria-labelledby="cuenta-titulo">
      <h3 id="cuenta-titulo" className="eyebrow">Cuenta y suscripción</h3>
      <div className="card-premium grid gap-3 rounded-2xl p-5 sm:grid-cols-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Comercio</p>
            <p className="truncate font-semibold">{user?.comercioNombre ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Dirección del panel</p>
            <p className="truncate font-mono text-sm">/{user?.comercioSlug ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Dueño</p>
            <p className="truncate font-semibold">{user?.nombre ?? "—"}</p>
          </div>
        </div>
      </div>
      <SuscripcionCard />
    </section>
  );
}
