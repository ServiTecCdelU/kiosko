"use client";

// components/demo/entrar-demo-form.tsx — antes de entrar a la demo publica se
// pide nombre y WhatsApp (los ve el superadmin en la pestaña Demo) y se entra
// directo, sin tipear el PIN. Lo usa el login (/login y /login?demo=landing).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginDemo } from "@/services/auth-service";
import { trackEvent } from "@/lib/analytics";
import { panelHref } from "@/lib/panel";
import { validarVisitaDemo, type OrigenDemo } from "@/lib/demo";

export function EntrarDemoForm({ origen }: { origen: OrigenDemo }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const validado = validarVisitaDemo({ nombre, telefono, origen });
    if (!validado.ok) {
      setError(validado.error);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const user = await loginDemo(validado.datos);
      trackEvent("demo_ingreso", { origen });
      toast.success(`¡Bienvenido a la demo, ${validado.datos.nombre.split(" ")[0]}!`);
      router.replace(panelHref(user.comercioSlug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar a la demo");
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={entrar} className="card-premium flex w-full flex-col gap-4 rounded-2xl p-5" noValidate>
      <p className="text-sm text-muted-foreground">
        Mirá el sistema con datos de ejemplo: vendé, abrí la caja y cargá stock. No hace falta crear cuenta.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="demo-nombre">Tu nombre</Label>
        <Input
          id="demo-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Juan"
          autoComplete="name"
          className="rounded-xl"
          autoFocus
          maxLength={80}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="demo-telefono">WhatsApp</Label>
        <Input
          id="demo-telefono"
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej: 3442 123456"
          autoComplete="tel"
          className="rounded-xl"
          maxLength={30}
        />
        <p className="text-xs text-muted-foreground">Por si tenés dudas: te escribimos para ayudarte, nada de spam.</p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {/* Azul 600 y no --primary: va sobre el tema oscuro del login y ahi el
          primary no llega al contraste 4,5:1 con texto blanco (igual que el registro). */}
      <Button type="submit" disabled={enviando} className="h-12 rounded-2xl bg-blue-600 text-sm text-white hover:bg-blue-500">
        {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
        Entrar a la demo
      </Button>
    </form>
  );
}
