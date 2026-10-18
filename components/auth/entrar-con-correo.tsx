"use client";

// components/auth/entrar-con-correo.tsx — los dos pasos de entrar sin Google:
// 1) el correo, 2) el codigo que llega ahi. Lo usan /registro y /login (los dos
// con el tema oscuro de la landing). Logica en lib/auth-correo.ts.
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enviarCodigoPorCorreo, entrarConCodigo } from "@/lib/auth-correo";
import { correoValido, limpiarCodigo, normalizarCorreo } from "@/lib/correo";

const ESPERA_REENVIO_S = 60;

interface EntrarConCorreoProps {
  /** Recibe a donde ir despues de entrar (lo decide app/api/auth/google-verify). */
  onEntrar: (redirectTo: string) => void;
  onVolver: () => void;
  claseBoton?: string;
  claseCampo?: string;
}

export function EntrarConCorreo({ onEntrar, onVolver, claseBoton = "", claseCampo = "rounded-xl" }: EntrarConCorreoProps) {
  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  // Cuenta regresiva para "Reenviar el código" (Supabase deja uno por minuto).
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const pedirCodigo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!correoValido(email)) {
      setError("Escribí tu correo completo, por ejemplo juan@hotmail.com");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await enviarCodigoPorCorreo(email);
      setPaso("codigo");
      setCodigo("");
      setEspera(ESPERA_REENVIO_S);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mandar el código");
    } finally {
      setEnviando(false);
    }
  };

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = limpiarCodigo(codigo);
    if (limpio.length < 6) {
      setError("Escribí el código completo que te llegó por correo.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      onEntrar(await entrarConCodigo(email, limpio));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
      setEnviando(false);
    }
  };

  if (paso === "correo") {
    return (
      <form onSubmit={pedirCodigo} className="flex flex-col gap-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="correo-acceso">Tu correo</Label>
          <Input
            id="correo-acceso"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Ej: juan@hotmail.com"
            className={claseCampo}
            autoFocus
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">Te mandamos un código para entrar. Sin contraseñas.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={enviando} className={`h-12 rounded-2xl text-base sm:text-sm ${claseBoton}`}>
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Mandarme el código
        </Button>
        <button type="button" onClick={onVolver} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verificar} className="flex flex-col gap-3" noValidate>
      <p className="text-sm">
        Te mandamos un código a <span className="font-semibold">{normalizarCorreo(email)}</span>.
        <span className="block text-xs text-muted-foreground">Si no lo ves en unos minutos, mirá en Spam o Promociones.</span>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="codigo-acceso">Código</Label>
        <Input
          id="codigo-acceso"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          onChange={(e) => setCodigo(limpiarCodigo(e.target.value).slice(0, 8))}
          placeholder="123456"
          className={`${claseCampo} text-center font-mono text-lg tracking-[0.4em]`}
          autoFocus
          maxLength={8}
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={enviando} className={`h-12 rounded-2xl text-base sm:text-sm ${claseBoton}`}>
        {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Entrar
      </Button>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button type="button" onClick={() => { setPaso("correo"); setError(null); }} className="hover:text-foreground">
          Cambiar el correo
        </button>
        <button type="button" disabled={espera > 0 || enviando} onClick={() => pedirCodigo()} className="hover:text-foreground disabled:opacity-60">
          {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar el código"}
        </button>
      </div>
    </form>
  );
}
