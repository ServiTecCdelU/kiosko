"use client";

// app/auth/callback/page.tsx — vuelta del login con Google (Supabase Auth).
// Tiene que ser una pagina de CLIENTE, no una ruta de servidor: el
// code_verifier del flujo PKCE lo guardo signInWithOAuth en el localStorage
// del navegador, y solo el navegador puede completar el intercambio con ese
// dato. El servidor (app/api/auth/google-verify) solo re-verifica el token
// resultante y emite la cookie de sesion.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const code = new URL(window.location.href).searchParams.get("code");
        if (!code) throw new Error();
        const { data, error } = await getSupabaseBrowser().auth.exchangeCodeForSession(code);
        const accessToken = data?.session?.access_token;
        if (error || !accessToken) throw new Error();

        const res = await fetch("/api/auth/google-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const body = await res.json();
        if (!res.ok || !body.redirectTo) throw new Error();

        router.replace(body.redirectTo);
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
