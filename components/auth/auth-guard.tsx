"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { NAV_ITEMS } from "@/lib/nav";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready, rol } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const item = NAV_ITEMS.find((i) => i.href === pathname);
  // admin ve todo; otros roles solo las rutas declaradas en item.roles.
  const bloqueado = !!item && rol !== null && rol !== "admin" && !item.roles?.includes(rol);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (bloqueado) {
      router.replace("/pos");
    }
  }, [ready, user, bloqueado, router]);

  if (!ready || !user || bloqueado) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
