"use client";

// app/auth/callback/page.tsx — vuelta del login con Google (Supabase Auth).
// El cliente de supabase-js usa flowType "implicit" por defecto: Supabase
// Auth vuelve con el access_token en el FRAGMENTO de la URL (#access_token=...),
// no en un ?code= de query string. El fragmento nunca llega al servidor (los
// navegadores no lo mandan en la request), asi que tiene que leerlo el
// navegador — de ahi que esto sea una pagina de cliente, no una ruta de
// servidor. app/api/auth/google-verify re-verifica el token server-side y
// emite la cookie de sesion.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/utils/api-url";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hash.get("access_token");
        if (!accessToken) {
          router.replace("/login?error=no_autorizado&detail=" + encodeURIComponent("sin access_token en el hash de la URL"));
          return;
        }

        const res = await fetch(apiUrl("/api/auth/google-verify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const body = await res.json();
        if (!res.ok || !body.redirectTo) {
          router.replace("/login?error=no_autorizado&detail=" + encodeURIComponent(body?.detail ?? "sin detalle"));
          return;
        }

        router.replace(body.redirectTo);
      } catch {
        router.replace("/login?error=no_autorizado&detail=" + encodeURIComponent("excepcion en el callback"));
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
