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
import { ArrowLeft, Check, Chrome, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/utils/api-url";
import { iniciarLoginGoogle } from "@/lib/auth-google";
import { RUBROS, validarRegistro } from "@/lib/registro";
import { slugDeNombre } from "@/lib/slug";
import { TRIAL_DAYS } from "@/lib/marketing/contact";

interface DatosGoogle {
  email: string;
  nombre: string;
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
    <main className="bg-mesh flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grad-brand shadow-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white">
          <Store className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Creá tu comercio</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          En dos minutos estás vendiendo. {TRIAL_DAYS} días gratis, sin tarjeta.
        </p>
      </div>

      {google === undefined ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : google === null ? (
        <PasoGoogle />
      ) : (
        <FormularioComercio google={google} />
      )}

      <Link href="/login" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
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
    <div className="card-premium flex w-full max-w-sm animate-in fade-in flex-col gap-4 rounded-2xl p-6 duration-300">
      <ul className="space-y-2">
        {BENEFICIOS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {b}
          </li>
        ))}
      </ul>
      <Button onClick={continuar} disabled={entrando} className="h-12 rounded-2xl text-sm">
        {entrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Chrome className="mr-2 h-4 w-4" />}
        Continuar con Google
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Con tu cuenta de Google entrás siempre a tu comercio, sin contraseñas.
      </p>
    </div>
  );
}

function FormularioComercio({ google }: { google: DatosGoogle }) {
  const router = useRouter();
  const [nombreComercio, setNombreComercio] = useState("");
  const [nombre, setNombre] = useState(google.nombre);
  const [telefono, setTelefono] = useState("");
  const [rubro, setRubro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const direccion = useMemo(() => (nombreComercio.trim() ? slugDeNombre(nombreComercio) : ""), [nombreComercio]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const validado = validarRegistro({ nombreComercio, nombre, telefono, rubro });
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
      router.replace(data.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el comercio");
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={crear} className="card-premium flex w-full max-w-sm animate-in fade-in flex-col gap-4 rounded-2xl p-6 duration-300" noValidate>
      <p className="text-xs text-muted-foreground">
        Entraste como <span className="font-medium text-foreground">{google.email}</span>
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="nombre-comercio">Nombre del comercio</Label>
        <Input
          id="nombre-comercio"
          value={nombreComercio}
          onChange={(e) => setNombreComercio(e.target.value)}
          placeholder="Ej: Kiosco El Sol"
          className="rounded-xl"
          autoFocus
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
        <Select value={rubro} onValueChange={setRubro}>
          <SelectTrigger id="rubro" className="w-full rounded-xl">
            <SelectValue placeholder="Elegí tu rubro" />
          </SelectTrigger>
          <SelectContent>
            {RUBROS.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nombre">Tu nombre</Label>
        <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" maxLength={80} />
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
          className="rounded-xl"
          maxLength={30}
        />
        <p className="text-xs text-muted-foreground">Para ayudarte a arrancar y avisarte antes de que termine la prueba.</p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={enviando} className="h-12 rounded-2xl text-sm">
        {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Crear mi comercio
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ¿Trabajás en un comercio que ya usa el sistema? No crees uno nuevo: pedile al dueño que te dé acceso.
      </p>
    </form>
  );
}
