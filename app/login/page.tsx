"use client";

// app/login/page.tsx — tres formas de entrar:
//   · "Acceso a demo": teclado numerico con el PIN publico de la demo a la vista.
//   · "Entrar con Google": dueños (admin) de cada comercio.
//   · "Soy empleado": PIN de 6 numeros, SOLO en una PC registrada por el dueño
//     (la PC sabe su comercio y su caja: "Super Patricia · Caja 1"). El PIN
//     viejo de 4 sirve una ultima vez para elegir el nuevo (app/cambiar-pin).
import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Store, Delete, Loader2, Chrome, ArrowLeft, PlayCircle, KeyRound, MonitorX } from "lucide-react";
import { cn } from "@/lib/utils";
import { login, loginDemo } from "@/services/auth-service";
import { getEstaPc, type EstaPc } from "@/services/dispositivo-service";
import { iniciarLoginGoogle } from "@/lib/auth-google";
import { TRIAL_DAYS } from "@/lib/marketing/contact";
import { DEMO_PIN } from "@/lib/demo";
import { LARGO_PIN, LARGO_PIN_VIEJO } from "@/lib/pin";
import { panelHref } from "@/lib/panel";
import type { Usuario } from "@/lib/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

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
  // undefined = consultando; la PC tiene que estar registrada para entrar con PIN.
  const [pc, setPc] = useState<EstaPc | undefined>(undefined);

  const largo = modo === "demo" ? DEMO_PIN.length : LARGO_PIN;

  useEffect(() => {
    if (searchParams.get("error") === "no_autorizado") {
      toast.error("No se pudo verificar tu cuenta de Google. Probá de nuevo.", { duration: 12000 });
    }
  }, [searchParams]);

  useEffect(() => {
    getEstaPc().then(setPc).catch(() => setPc({ registrada: false }));
  }, []);

  const entrarConGoogle = useCallback(async () => {
    setEntrandoGoogle(true);
    try {
      await iniciarLoginGoogle();
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
        if (user.debeCambiarPin) {
          toast.info("Ahora el PIN es de 6 números: elegí el tuyo.");
          router.replace("/cambiar-pin");
          return;
        }
        toast.success(modo === "demo" ? "¡Bienvenido a la demo!" : `Hola, ${user.nombre}`);
        router.replace(user.rol === "admin" ? panelHref(user.comercioSlug) : "/pos");
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
        if (p.length >= largo) return p;
        const next = p + key;
        if (next.length === largo) submit(next);
        return next;
      });
    },
    [working, submit, largo],
  );

  const abrir = (m: Modo) => {
    setPin("");
    setModo(m);
  };
  const volver = () => abrir("inicio");

  const pcLista = modo !== "pin" || pc?.registrada === true;

  // Con teclado fisico tambien: numeros, borrar, Enter (PIN viejo de 4) y Escape.
  useEffect(() => {
    if (modo === "inicio" || !pcLista) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
      else if (e.key === "Enter" && modo === "pin" && pin.length === LARGO_PIN_VIEJO) submit(pin);
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
          {pc?.registrada && (
            <p className="rounded-2xl border bg-card px-4 py-2 text-center text-xs text-muted-foreground">
              Esta PC es <b className="text-foreground">{pc.comercio} · {pc.caja}</b>
            </p>
          )}

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

          <Link
            href="/registro"
            className="rounded-2xl border border-dashed border-primary/40 px-4 py-2.5 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            ¿Todavía no tenés cuenta? <span className="font-semibold text-primary">Creá tu comercio</span> · {TRIAL_DAYS} días gratis
          </Link>

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

          {modo === "pin" && pc === undefined && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}

          {modo === "pin" && pc && !pc.registrada && (
            <div className="w-full space-y-2 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4 text-center">
              <MonitorX className="mx-auto h-6 w-6 text-warning" />
              <p className="text-sm font-medium">Esta PC no está registrada</p>
              <p className="text-xs text-muted-foreground">
                Para entrar con PIN, el dueño tiene que registrarla una vez: entra con Google en esta PC y va a
                <b> Caja → Registrar esta PC</b>.
              </p>
            </div>
          )}

          {pcLista && (modo === "demo" || pc !== undefined) && (
            <>
              {modo === "pin" && pc?.registrada && (
                <p className="text-center text-sm">
                  <b>{pc.comercio}</b> · {pc.caja}
                </p>
              )}

              <div className="flex items-center gap-3" aria-label="PIN">
                {Array.from({ length: largo }).map((_, i) => (
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

              {modo === "pin" && pin.length === LARGO_PIN_VIEJO && !working && (
                <button onClick={() => submit(pin)} className="text-xs text-primary hover:underline">
                  Entrar con mi PIN viejo de {LARGO_PIN_VIEJO} números
                </button>
              )}

              {working && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </>
          )}

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
