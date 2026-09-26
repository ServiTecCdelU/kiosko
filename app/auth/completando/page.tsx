"use client";

// app/auth/completando/page.tsx — puente tras el login con Google.
// app/auth/callback/route.ts ya emitio la cookie de sesion server-side;
// esta pagina la lee (via /api/auth/session), la vuelca al sessionStorage
// del cliente (igual que hace el login por PIN) y recien ahi navega.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setCurrentUser } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/utils/api-url";

export default function CompletandoLoginPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/auth/session"));
        if (!res.ok) throw new Error();
        const user = await res.json();
        setCurrentUser(user);
        router.replace(user.rol === "admin" ? "/" : "/pos");
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
