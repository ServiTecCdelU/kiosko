"use client";

// app/login/page.tsx — tres formas de entrar:
//   · "Acceso a demo": teclado numerico con el PIN publico de la demo a la vista.
//   · "Entrar con Google": administradores (dueños) de cada comercio.
//   · "Soy empleado": teclado numerico con el PIN propio de cajero/encargado.
import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Store, Delete, Loader2, Chrome, ArrowLeft, PlayCircle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { login, loginDemo } from "@/services/auth-service";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiUrl } from "@/lib/utils/api-url";
import { DEMO_PIN } from "@/lib/demo";
import type { Usuario } from "@/lib/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
const PIN_LENGTH = 4;

type Modo = "inicio" | "demo" | "pin";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modo, setModo] = useState<Modo>("inicio");
  const [pin, setPin] = useState("");
  const [working, setWorking] = useState(false);
  const [entrandoGoogle, setEntrandoGoogle] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "no_autorizado") {
      toast.error(
        "Esa cuenta de Google no tiene acceso. Pedile a tu proveedor que dé de alta tu correo.",
        { duration: 12000 },
      );
    }
  }, [searchParams]);

  const entrarConGoogle = useCallback(async () => {
    setEntrandoGoogle(true);
    try {
      const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${apiUrl("/auth/callback")}` },
      });
      if (error) throw error;
      // signInWithOAuth redirige el navegador entero: si llega hasta aca es
      // porque fallo antes de redirigir.
    } catch {
      toast.error("No se pudo iniciar sesión con Google");
      setEntrandoGoogle(false);
    }
  }, []);

  const submit = useCallback(
    async (value: string) => {
      setWorking(true);
      try {
        const user: Usuario = modo === "demo" ? await loginDemo(value) : await login(value);
        toast.success(modo === "demo" ? "¡Bienvenido a la demo!" : `Hola, ${user.nombre}`);
        router.replace(user.rol === "admin" ? "/" : "/pos");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "PIN incorrecto");
        setPin("");
      } finally {
        setWorking(false);
      }
    },
    [router, modo],
  );

  const press = useCallback(
    (key: string) => {
      if (working) return;
      if (key === "del") {
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (!key) return;
      setPin((p) => {
        if (p.length >= PIN_LENGTH) return p;
        const next = p + key;
        if (next.length === PIN_LENGTH) submit(next);
        return next;
      });
    },
    [working, submit],
  );

  const abrir = (m: Modo) => {
    setPin("");
    setModo(m);
  };
  const volver = () => abrir("inicio");

  // Con teclado fisico tambien: numeros y borrar
  useEffect(() => {
    if (modo === "inicio") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
      else if (e.key === "Escape") volver();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="bg-mesh flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grad-brand shadow-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white">
          <Store className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Comercio Platform</h1>
        <p className="text-sm text-muted-foreground">
          {modo === "inicio" ? "Punto de venta para tu comercio" : modo === "demo" ? "Acceso a la demo" : "Ingresá tu PIN de empleado"}
        </p>
      </div>

      {modo === "inicio" ? (
        <div className="flex w-full max-w-[300px] animate-in fade-in flex-col gap-3 duration-300">
          <button
            onClick={() => abrir("demo")}
            className="grad-brand shadow-brand flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <PlayCircle className="h-6 w-6 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Acceso a demo</span>
              <span className="block text-xs text-white/80">Probá el sistema con datos de ejemplo</span>
            </span>
          </button>

          <button
            onClick={entrarConGoogle}
            disabled={entrandoGoogle}
            className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-3.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {entrandoGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
            Entrar con Google
          </button>

          <button
            onClick={() => abrir("pin")}
            className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <KeyRound className="h-3.5 w-3.5" /> Soy empleado · entrar con mi PIN
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-[260px] animate-in fade-in flex-col items-center gap-6 duration-300">
          {modo === "demo" && (
            <div className="w-full rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">La contraseña de la demo es</p>
              <p className="cifra text-3xl font-bold tracking-[0.3em] text-primary">{DEMO_PIN}</p>
            </div>
          )}

          <div className="flex items-center gap-3" aria-label="PIN">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full border-2 transition-colors",
                  i < pin.length ? "border-primary bg-primary" : "border-muted-foreground/40",
                )}
              />
            ))}
          </div>

          <div className="grid w-full grid-cols-3 gap-3">
            {KEYS.map((key, i) => {
              if (key === "") return <span key={i} />;
              const isDel = key === "del";
              return (
                <button
                  key={i}
                  onClick={() => press(key)}
                  disabled={working}
                  aria-label={isDel ? "Borrar" : key}
                  className={cn(
                    "flex h-16 items-center justify-center rounded-2xl border bg-card text-xl font-semibold transition-colors",
                    "hover:bg-accent hover:text-accent-foreground active:scale-95",
                    isDel && "text-muted-foreground",
                  )}
                >
                  {isDel ? <Delete className="h-5 w-5" /> : key}
                </button>
              );
            })}
          </div>

          {working && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

          <button
            onClick={volver}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
        </div>
      )}
    </main>
  );
}
