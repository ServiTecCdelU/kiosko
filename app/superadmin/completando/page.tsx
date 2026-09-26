"use client";

// app/superadmin/completando/page.tsx — puente tras el login con Google del
// superadmin. Mismo criterio que app/auth/completando/page.tsx pero guarda en
// un sessionStorage separado (hooks/use-superadmin.ts).
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setSuperadminActual } from "@/hooks/use-superadmin";

export default function CompletandoSuperadminPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/superadmin/session");
        if (!res.ok) throw new Error();
        const user = await res.json();
        setSuperadminActual(user);
        router.replace("/superadmin");
      } catch {
        router.replace("/login?error=no_autorizado");
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
