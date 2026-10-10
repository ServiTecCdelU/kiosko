"use client";

// components/home/cuenta-card.tsx — tarjeta "Cuenta" del inicio (admin): el
// comercio, la direccion del panel y quien esta logueado. La suscripcion va en
// su propia tarjeta (components/home/suscripcion-card.tsx), debajo.
import { Building2, Link2, UserRound } from "lucide-react";
import { getCurrentUser } from "@/hooks/use-auth";
import { useEsDemo } from "@/components/home/aviso-version-paga";

export function CuentaCard() {
  const user = getCurrentUser();
  const esDemo = useEsDemo();
  if (esDemo) return null;
  return (
    <section className="card-premium rounded-2xl p-5" aria-labelledby="cuenta-titulo">
      <h3 id="cuenta-titulo" className="eyebrow mb-3">Cuenta</h3>
      <div className="grid gap-3 sm:grid-cols-3">
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
            <p className="truncate font-semibold">{user?.nombre ?? "—"}{user?.email ? ` · ${user.email}` : ""}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
