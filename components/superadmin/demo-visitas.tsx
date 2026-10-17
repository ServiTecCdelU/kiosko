"use client";
// components/superadmin/demo-visitas.tsx — quien entro a la demo publica
// (nombre y WhatsApp que deja antes de entrar, 60_demo_visitas.sql), para
// escribirle a los que miraron y no crearon su comercio.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, PlayCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { superadminApi } from "@/components/superadmin/comun";

interface Visita {
  id: number;
  nombre: string;
  telefono: string;
  origen: string | null;
  created_at: string;
  /** Comercio creado despues con el mismo WhatsApp. */
  comercio: string | null;
}

const MENSAJE = "Hola! Soy de ServiTec. Vi que estuviste mirando la demo del sistema, ¿te puedo ayudar en algo?";

/** wa.me necesita el numero internacional: un celular argentino sin codigo va con 549. */
function linkWhatsApp(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  const numero = d.startsWith("54") ? d : `549${d.replace(/^0/, "")}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(MENSAJE)}`;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

export function DemoVisitas() {
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await superadminApi<{ visitas: Visita[] }>({ accion: "demoVisitas" });
      setVisitas(r.visitas ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar las visitas a la demo");
      setVisitas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => {
    const lista = visitas ?? [];
    const hace7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const personas = new Set(lista.map((v) => v.telefono.replace(/\D/g, "").slice(-10)));
    const registrados = new Set(lista.filter((v) => v.comercio).map((v) => v.telefono.replace(/\D/g, "").slice(-10)));
    return {
      semana: lista.filter((v) => new Date(v.created_at).getTime() >= hace7).length,
      personas: personas.size,
      registrados: registrados.size,
    };
  }, [visitas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return visitas ?? [];
    return (visitas ?? []).filter((v) => `${v.nombre} ${v.telefono}`.toLowerCase().includes(q));
  }, [visitas, busqueda]);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Dato titulo="Entradas esta semana" valor={resumen.semana} />
        <Dato titulo="Personas distintas" valor={resumen.personas} />
        <Dato titulo="Crearon su comercio" valor={resumen.registrados} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className="h-10 rounded-2xl bg-card/70 pl-9"
          />
        </div>
        <Button variant="outline" className="h-10 rounded-2xl" onClick={cargar} disabled={cargando} title="Actualizar">
          <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
        </Button>
      </div>

      {visitas === null ? (
        <ul className="card-premium divide-y divide-border/60 overflow-hidden rounded-2xl">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-8 w-28 rounded-xl" />
            </li>
          ))}
        </ul>
      ) : visibles.length === 0 ? (
        <div className="card-premium flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <PlayCircle className="h-6 w-6" />
          </span>
          <p className="font-semibold">{visitas.length === 0 ? "Todavía nadie entró a la demo" : "Nadie coincide con la búsqueda"}</p>
          <p className="text-sm text-muted-foreground">Cada vez que alguien entra deja su nombre y WhatsApp, y aparece acá.</p>
        </div>
      ) : (
        <ul className="card-premium divide-y divide-border/60 overflow-hidden rounded-2xl">
          {visibles.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.nombre}</p>
                <p className="cifra truncate text-xs text-muted-foreground">
                  {v.telefono} · {fecha(v.created_at)}{v.origen === "landing" ? " · desde la web" : ""}
                </p>
              </div>
              {v.comercio && (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3 w-3" /> Creó {v.comercio}
                </span>
              )}
              <a
                href={linkWhatsApp(v.telefono)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="cifra mt-1 text-2xl font-bold">{valor}</p>
    </div>
  );
}
