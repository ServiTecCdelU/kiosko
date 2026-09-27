"use client";
// components/superadmin/accesos-google.tsx — correos de Google que pueden
// entrar como administrador a un comercio (usuarios rol admin con email).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { superadminApi, type AccesoGoogle } from "@/components/superadmin/comun";

interface AccesosGoogleProps {
  comercioId: string;
  /** Avisa que cambio la cantidad de accesos (para refrescar la lista). */
  onCambio: () => void;
}

export function AccesosGoogle({ comercioId, onCambio }: AccesosGoogleProps) {
  const [accesos, setAccesos] = useState<AccesoGoogle[] | null>(null);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { accesos } = await superadminApi<{ accesos: AccesoGoogle[] }>({ accion: "accesos", id: comercioId });
      setAccesos(accesos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar los accesos");
      setAccesos([]);
    }
  }, [comercioId]);

  useEffect(() => { cargar(); }, [cargar]);

  const agregar = async () => {
    setTrabajando("nuevo");
    try {
      await superadminApi({ accion: "agregarAcceso", id: comercioId, email, nombre });
      toast.success(`${email} ya puede entrar con Google`);
      setEmail("");
      setNombre("");
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo dar acceso");
    } finally {
      setTrabajando(null);
    }
  };

  const quitar = async (a: AccesoGoogle) => {
    setTrabajando(a.id);
    try {
      await superadminApi({ accion: "quitarAcceso", id: comercioId, usuarioId: a.id });
      toast.success(`Acceso de ${a.email} quitado`);
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar el acceso");
    } finally {
      setTrabajando(null);
    }
  };

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Mail className="h-4 w-4 text-primary" /> Acceso con Google
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Estos correos entran como administradores de este comercio con el botón “Entrar con Google”.
      </p>

      {accesos == null ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Cargando…</p>
      ) : accesos.length === 0 ? (
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Todavía nadie puede entrar con Google.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border">
          {accesos.map((a) => (
            <li key={a.id} className={cn("flex items-center gap-2 px-3 py-2", !a.activo && "opacity-50")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.email}</span>
                <span className="text-[11px] text-muted-foreground">{a.nombre}{!a.activo && " · sin acceso"}</span>
              </span>
              {a.activo && (
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                  title="Quitar acceso" disabled={trabajando != null} onClick={() => quitar(a)}
                >
                  {trabajando === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_0.7fr_auto]">
        <Input
          type="email" placeholder="correo@gmail.com" value={email}
          onChange={(e) => setEmail(e.target.value)} className="h-9 rounded-xl text-sm"
          onKeyDown={(e) => { if (e.key === "Enter" && emailValido) agregar(); }}
        />
        <Input placeholder="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9 rounded-xl text-sm" />
        <Button size="sm" className="h-9 rounded-xl" disabled={!emailValido || trabajando != null} onClick={agregar}>
          {trabajando === "nuevo" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          Dar acceso
        </Button>
      </div>
    </div>
  );
}
