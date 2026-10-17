"use client";

// app/registro/page.tsx — alta self-service de un comercio.
// Paso 1: "Continuar con Google" (mismo OAuth del login). Si el correo no tiene
// comercio, google-verify deja una cookie de registro y vuelve aca.
// Paso 2: datos del comercio → POST /api/registro → panel /<slug>, en prueba.
// Spec: docs/superpowers/specs/2026-10-03-autoregistro-design.md
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, PlayCircle, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/utils/api-url";
import { trackRegistroCompletado } from "@/lib/analytics";
import { iniciarLoginGoogle } from "@/lib/auth-google";
import { MAX_CAJAS_REGISTRO, PLANES_REGISTRO, RUBROS, validarRegistro } from "@/lib/registro";
import { slugDeNombre } from "@/lib/slug";
import { ROUTES, TRIAL_DAYS } from "@/lib/marketing/contact";

interface PlanRegistro {
  plan: "basico" | "pro";
  precioMensual: number;
  cajasIncluidas: number;
  precioCajaExtra: number;
  maxCajas: number | null;
}

interface DatosGoogle {
  email: string;
  nombre: string;
  /** Precios vigentes (saas_planes), para mostrarlos al elegir el plan. */
  planes?: PlanRegistro[];
}

// Campos de 44 px en el celular: comodos para el dedo (en PC, el tamaño de siempre).
const CAMPO = "h-11 rounded-xl sm:h-9";
const CAMPO_SELECT = "rounded-xl data-[size=default]:h-11 sm:data-[size=default]:h-9";
// Azul 600 y no --primary: blanco sobre el primary de la landing no llega al
// contraste 4,5:1 (mismo criterio que btnPrimary en components/landing/shared.tsx).
const BOTON = "bg-blue-600 text-white shadow-[0_8px_32px_-8px_rgba(59,139,255,0.65)] hover:bg-blue-500";

/** Logo de Google (la "G" de cuatro colores) para el boton de entrar. */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mr-2 h-5 w-5 rounded-full bg-white p-0.5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

const BENEFICIOS = [
  `${TRIAL_DAYS} días gratis, sin tarjeta`,
  "Punto de venta, caja, stock y fiado desde el primer día",
  "Tus datos son tuyos: los exportás cuando quieras",
];

export default function RegistroPage() {
  // undefined = cargando; null = todavia no paso por Google
  const [google, setGoogle] = useState<DatosGoogle | null | undefined>(undefined);

  useEffect(() => {
    fetch(apiUrl("/api/registro"))
      .then(async (r) => (r.ok ? ((await r.json()) as DatosGoogle) : null))
      .then(setGoogle)
      .catch(() => setGoogle(null));
  }, []);

  return (
    // Mismo tema oscuro que la landing (.landing-theme en globals.css): quien
    // toca "Probar gratis" sigue en la misma estetica, sin el salto a lo claro.
    <main className="landing-theme relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-background px-4 py-8 text-foreground sm:gap-8 sm:p-6">
      {/* Mismo resplandor y cuadricula de la portada de la landing (hero.tsx). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(59,139,255,0.28),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,180,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,180,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent)]"
      />
      <div className="relative flex flex-col items-center gap-2 text-center sm:gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_8px_24px_-8px_rgba(59,139,255,0.8)] sm:h-16 sm:w-16">
          <Store className="h-7 w-7 sm:h-8 sm:w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Creá tu comercio</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {google ? "Último paso: los datos de tu comercio." : "En dos minutos estás vendiendo."}
        </p>
      </div>

      {google === undefined ? (
        <Loader2 className="relative h-6 w-6 animate-spin text-muted-foreground" />
      ) : google === null ? (
        <PasoGoogle />
      ) : (
        <FormularioComercio google={google} />
      )}

      <Link href="/login" className="relative flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Ya tengo cuenta · Ingresar
      </Link>
    </main>
  );
}

function PasoGoogle() {
  const [entrando, setEntrando] = useState(false);

  const continuar = async () => {
    setEntrando(true);
    try {
      await iniciarLoginGoogle();
    } catch {
      toast.error("No se pudo iniciar sesión con Google");
      setEntrando(false);
    }
  };

  return (
    <div className="card-premium relative flex w-full max-w-sm animate-in fade-in flex-col gap-4 rounded-2xl p-5 duration-300 sm:p-6">
      <ul className="space-y-2.5">
        {BENEFICIOS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {b}
          </li>
        ))}
      </ul>
      <Button onClick={continuar} disabled={entrando} className={`h-12 rounded-2xl text-base sm:text-sm ${BOTON}`}>
        {entrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogoGoogle />}
        Continuar con Google
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Con tu cuenta de Google entrás siempre a tu comercio, sin contraseñas.
      </p>
      {/* Para quien todavia no se decide: ver el sistema sin registrarse. */}
      <Link
        href={ROUTES.demo}
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/40 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <PlayCircle className="h-4 w-4 text-primary" /> ¿Querés verlo antes? <span className="font-semibold text-primary">Mirá la demo</span>
      </Link>
    </div>
  );
}

function FormularioComercio({ google }: { google: DatosGoogle }) {
  const router = useRouter();
  const [nombreComercio, setNombreComercio] = useState("");
  const [nombre, setNombre] = useState(google.nombre);
  const [telefono, setTelefono] = useState("");
  const [rubro, setRubro] = useState("");
  const [plan, setPlan] = useState<"basico" | "pro">("basico");
  const [cajas, setCajas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const direccion = useMemo(() => (nombreComercio.trim() ? slugDeNombre(nombreComercio) : ""), [nombreComercio]);
  const precioDe = (id: "basico" | "pro") => google.planes?.find((p) => p.plan === id);
  const tarifa = precioDe(plan);
  const cajasCobradas = plan === "pro" ? cajas : 1;
  const totalMes = tarifa
    ? tarifa.precioMensual + Math.max(0, cajasCobradas - tarifa.cajasIncluidas) * tarifa.precioCajaExtra
    : null;

  // Un supermercado suele tener varias cajas: se sugiere Pro al elegir ese rubro.
  const elegirRubro = (r: string) => {
    setRubro(r);
    if (r === "supermercado" && plan === "basico") setPlan("pro");
  };
  const elegirPlan = (p: "basico" | "pro") => {
    setPlan(p);
    if (p === "basico") setCajas(1);
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const validado = validarRegistro({ nombreComercio, nombre, telefono, rubro, plan, cajas: cajasCobradas });
    if (!validado.ok) {
      setError(validado.error);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch(apiUrl("/api/registro"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validado.datos),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el comercio");
      toast.success("¡Listo! Tu comercio está creado");
      trackRegistroCompletado({ plan: validado.datos.plan, rubro: validado.datos.rubro });
      router.replace(data.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el comercio");
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={crear} className="card-premium relative flex w-full max-w-sm animate-in fade-in flex-col gap-4 rounded-2xl p-5 duration-300 sm:p-6" noValidate>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          Entraste como <span className="font-medium text-foreground">{google.email}</span>
        </span>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">Paso 2 de 2</span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nombre-comercio">Nombre del comercio</Label>
        <Input
          id="nombre-comercio"
          value={nombreComercio}
          onChange={(e) => setNombreComercio(e.target.value)}
          placeholder="Ej: Kiosco El Sol"
          className={CAMPO}
          autoComplete="organization"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={80}
        />
        {direccion && (
          <p className="truncate text-xs text-muted-foreground">
            Tu panel: <span className="font-mono">…/{direccion}</span>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rubro">Rubro</Label>
        <Select value={rubro} onValueChange={elegirRubro}>
          <SelectTrigger id="rubro" className={`w-full ${CAMPO_SELECT}`}>
            <SelectValue placeholder="Elegí tu rubro" />
          </SelectTrigger>
          <SelectContent className="landing-theme">
            {RUBROS.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Plan</Label>
        <div className="grid grid-cols-2 gap-2">
          {PLANES_REGISTRO.map((p) => {
            const t = precioDe(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => elegirPlan(p.id)}
                className={`flex flex-col items-start justify-start rounded-2xl border-2 p-3 text-left transition-colors ${plan === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
              >
                <span className="block font-semibold">{p.nombre}</span>
                {t && t.precioMensual > 0 && (
                  <span className="cifra block text-sm text-muted-foreground">
                    ${t.precioMensual.toLocaleString("es-AR")} / mes
                  </span>
                )}
                <span className="mt-1 block text-xs text-muted-foreground">{p.detalle}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Los {TRIAL_DAYS} días de prueba son gratis con cualquier plan. Lo podés cambiar después.</p>
      </div>

      {plan === "pro" && (
        <div className="space-y-1.5">
          <Label htmlFor="cajas">¿Cuántas cajas tenés?</Label>
          <Select value={String(cajas)} onValueChange={(v) => setCajas(Number(v))}>
            <SelectTrigger id="cajas" className={`w-full ${CAMPO_SELECT}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="landing-theme">
              {Array.from({ length: MAX_CAJAS_REGISTRO }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "caja" : "cajas"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Se crean listas para usar.
            {tarifa && tarifa.precioCajaExtra > 0 && ` La primera está incluida; cada caja extra suma $${tarifa.precioCajaExtra.toLocaleString("es-AR")} por mes.`}
            {totalMes !== null && totalMes > 0 && ` Total: $${totalMes.toLocaleString("es-AR")} por mes después de la prueba.`}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="nombre">Tu nombre</Label>
        <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={80} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telefono">WhatsApp</Label>
        <Input
          id="telefono"
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej: 3442 123456"
          className={CAMPO}
          autoComplete="tel"
          enterKeyHint="done"
          maxLength={30}
        />
        <p className="text-xs text-muted-foreground">Para ayudarte a arrancar y avisarte antes de que termine la prueba.</p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={enviando} className={`h-12 rounded-2xl text-base sm:text-sm ${BOTON}`}>
        {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Crear mi comercio
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ¿Trabajás en un comercio que ya usa el sistema? No crees uno nuevo: pedile al dueño que te dé acceso.
      </p>
    </form>
  );
}
