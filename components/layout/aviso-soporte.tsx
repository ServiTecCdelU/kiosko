"use client";
// components/layout/aviso-soporte.tsx — franja fija cuando el superadmin esta
// adentro del panel de un comercio (modo soporte), con la salida al superadmin.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, LifeBuoy, Loader2 } from "lucide-react";
import { getCurrentUser, setCurrentUser } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/utils/api-url";
import type { Usuario } from "@/lib/types";

export function AvisoSoporte() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  // La sesion vive en sessionStorage: se lee al montar para no desfasar el render del server
  const [user, setUser] = useState<Usuario | null>(null);
  useEffect(() => { setUser(getCurrentUser()); }, []);
  if (!user?.soporte) return null;

  const volver = async () => {
    setSaliendo(true);
    try {
      const res = await fetch(apiUrl("/api/superadmin/comercios"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "salir" }),
      });
      if (!res.ok) throw new Error();
      setCurrentUser(null);
      router.push("/superadmin");
    } catch {
      toast.error("No se pudo volver al superadmin");
      setSaliendo(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-warning/15 px-4 py-2 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <LifeBuoy className="h-4 w-4 shrink-0 text-warning" />
        Modo soporte · estás en el panel de <b>{user.comercioNombre ?? user.comercioId}</b>
      </span>
      <button
        onClick={volver}
        disabled={saliendo}
        className="flex items-center gap-1.5 rounded-xl border border-warning/40 bg-background px-3 py-1 text-xs font-semibold transition-colors hover:bg-warning/10 disabled:opacity-60"
      >
        {saliendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
        Volver al superadmin
      </button>
    </div>
  );
}
