"use client";

// app/cambiar-pin/page.tsx — el empleado elige su PIN de 6 numeros.
// Obligatoria para quien entro con el PIN viejo de 4: AuthGuard lo trae aca y
// el servidor (proxy.ts) no le deja hacer otra cosa hasta terminar.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, setCurrentUser } from "@/hooks/use-auth";
import { cambiarMiPin } from "@/services/dispositivo-service";
import { LARGO_PIN, errorPinNuevo } from "@/lib/pin";

export default function CambiarPinPage() {
  const router = useRouter();
  const { user, ready, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  const errorPin = pin.length === LARGO_PIN ? errorPinNuevo(pin) : null;
  const noCoinciden = confirmacion.length === LARGO_PIN && pin !== confirmacion;
  const listo = pin.length === LARGO_PIN && !errorPin && pin === confirmacion;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || !user) return;
    setGuardando(true);
    try {
      await cambiarMiPin(pin);
      setCurrentUser({ ...user, debeCambiarPin: false });
      toast.success("Listo: desde ahora entrás con tu PIN nuevo");
      router.replace("/pos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el PIN");
      setGuardando(false);
    }
  };

  const soloNumeros = (v: string) => v.replace(/\D/g, "").slice(0, LARGO_PIN);

  if (!user) return null;

  return (
    <main className="bg-mesh flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grad-brand shadow-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white">
          <KeyRound className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Elegí tu PIN nuevo</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Hola {user.nombre}. Para más seguridad, el PIN ahora es de {LARGO_PIN} números. Es solo tuyo: no se lo pases a nadie.
        </p>
      </div>

      <form onSubmit={guardar} className="card-premium flex w-full max-w-xs flex-col gap-4 rounded-2xl p-6">
        <div className="space-y-1.5">
          <Label htmlFor="pin">PIN nuevo ({LARGO_PIN} números)</Label>
          <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" autoFocus
            value={pin} onChange={(e) => setPin(soloNumeros(e.target.value))} maxLength={LARGO_PIN}
            className="rounded-xl text-center text-lg tracking-[0.4em]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmacion">Repetilo</Label>
          <Input id="confirmacion" type="password" inputMode="numeric" autoComplete="new-password"
            value={confirmacion} onChange={(e) => setConfirmacion(soloNumeros(e.target.value))} maxLength={LARGO_PIN}
            className="rounded-xl text-center text-lg tracking-[0.4em]" />
        </div>
        {(errorPin || noCoinciden) && (
          <p role="alert" className="text-sm text-destructive">{errorPin ?? "Los dos PIN no coinciden"}</p>
        )}
        <Button type="submit" className="h-11 rounded-xl" disabled={!listo || guardando}>
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar y entrar
        </Button>
        <button type="button" onClick={() => { logout(); router.replace("/login"); }} className="text-xs text-muted-foreground hover:text-foreground">
          Salir
        </button>
      </form>
    </main>
  );
}
