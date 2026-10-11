"use client";

// app/superadmin/page.tsx — panel de superadmin: ver y administrar todos los
// comercios del SaaS. Item 5.2 del plan maestro.
// No usa AppShell/hooks/use-auth.ts a proposito: ese es el estado de UN
// comercio; esta pantalla no pertenece a ninguno. La excepcion es "Entrar":
// ahi se carga el usuario de soporte en use-auth para abrir el panel del comercio.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownAZ, BarChart3, Building2, CircleDollarSign, LogOut, Loader2, Chrome, Plus, RefreshCw, Search, SearchX, ShieldCheck,
} from "lucide-react";
import { PlanesDialog } from "@/components/superadmin/planes-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuperadmin } from "@/hooks/use-superadmin";
import { setCurrentUser } from "@/hooks/use-auth";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiUrl } from "@/lib/utils/api-url";
import { panelHref } from "@/lib/panel";
import { cn } from "@/lib/utils";
import { ComercioFila } from "@/components/superadmin/comercio-fila";
import { ComercioDialog } from "@/components/superadmin/comercio-dialog";
import { NuevoComercioDialog } from "@/components/superadmin/nuevo-comercio-dialog";
import { Resumen, resumenDe, type FiltroRapido } from "@/components/superadmin/resumen";
import { Metricas } from "@/components/superadmin/metricas";
import {
  ESTADO_LABEL, ESTADO_PUNTO, ESTADOS, PLAN_LABEL, esNuevo, necesitaAtencion, pagoAlDia, preciosDe, superadminApi,
  type Comercio, type GrupoSaas, type PlanSaas, type PreciosPlan,
} from "@/components/superadmin/comun";

export default function SuperadminPage() {
  const { user, ready, logout } = useSuperadmin();
  const [entrando, setEntrando] = useState(false);

  const entrarConGoogle = async () => {
    setEntrando(true);
    try {
      const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${apiUrl("/auth/callback")}` },
      });
      if (error) throw error;
    } catch {
      toast.error("No se pudo iniciar sesión con Google");
      setEntrando(false);
    }
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="bg-mesh flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grad-brand shadow-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de superadmin</h1>
          <p className="text-sm text-muted-foreground">MultiComercioPanel · ServiTec<br />Acceso restringido al equipo</p>
        </div>
        <button
          onClick={entrarConGoogle}
          disabled={entrando}
          className="card-premium flex w-full max-w-[260px] items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
          Entrar con Google
        </button>
      </main>
    );
  }

  return <Panel nombre={user.nombre} email={user.email} onLogout={logout} />;
}

type FiltroEstado = "todos" | Comercio["estado"];
type FiltroPlan = "todos" | Comercio["plan"];
type Orden = "recientes" | "nombre" | "ventas" | "atencion";

const ORDEN_LABEL: Record<Orden, string> = {
  recientes: "Más nuevos primero", nombre: "Nombre", ventas: "Más ventas", atencion: "Atención primero",
};

function Panel({ nombre, email, onLogout }: { nombre: string; email: string; onLogout: () => void }) {
  const router = useRouter();
  const [comercios, setComercios] = useState<Comercio[]>([]);
  const [grupos, setGrupos] = useState<GrupoSaas[]>([]);
  const [precios, setPrecios] = useState<PreciosPlan>({});
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [planesOpen, setPlanesOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [rapido, setRapido] = useState<FiltroRapido>("todos");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [plan, setPlan] = useState<FiltroPlan>("todos");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [administrando, setAdministrando] = useState<string | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);
  const [vista, setVista] = useState<"comercios" | "metricas">("comercios");

  const load = useCallback(async () => {
    try {
      const r = await superadminApi<{ comercios: Comercio[]; grupos?: GrupoSaas[]; planes?: PlanSaas[] }>({ accion: "listar" });
      setComercios(r.comercios ?? []);
      setGrupos(r.grupos ?? []);
      setPrecios(preciosDe(r.planes));
    } catch {
      toast.error("No se pudieron cargar los comercios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refrescar = async () => {
    setRefrescando(true);
    await load();
    setRefrescando(false);
  };

  // Modo soporte: la cookie pasa a ser la de ese comercio (como admin) y la app
  // se abre en su panel. Desde el aviso de arriba se vuelve al superadmin.
  const entrar = async (c: Comercio) => {
    setEntrando(c.id);
    try {
      await superadminApi({ accion: "entrar", id: c.id });
      const res = await fetch(apiUrl("/api/auth/session"));
      const user = await res.json();
      if (!res.ok) throw new Error(user?.error ?? "No se pudo abrir el panel");
      setCurrentUser(user);
      router.push(panelHref(user.comercioSlug));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo entrar al comercio");
      setEntrando(null);
    }
  };

  const porEstado = useMemo(() => {
    const n: Record<FiltroEstado, number> = { todos: comercios.length, activo: 0, prueba: 0, suspendido: 0, baja: 0 };
    for (const c of comercios) n[c.estado]++;
    return n;
  }, [comercios]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let lista = comercios;
    if (q) lista = lista.filter((c) => `${c.nombre} ${c.slug} ${c.config?.telefono ?? ""}`.toLowerCase().includes(q));
    if (estado !== "todos") lista = lista.filter((c) => c.estado === estado);
    if (plan !== "todos") lista = lista.filter((c) => c.plan === plan);
    if (rapido === "atencion") lista = lista.filter((c) => necesitaAtencion(c, precios));
    if (rapido === "nuevos") lista = lista.filter(esNuevo);
    if (rapido === "cobros") lista = lista.filter((c) => c.estado === "activo" && (precios[c.plan] ?? 0) > 0 && !pagoAlDia(c));

    const peso = (c: Comercio) => (necesitaAtencion(c, precios) ? 0 : c.estado === "baja" ? 2 : 1);
    return [...lista].sort((a, b) => {
      if (orden === "nombre") return a.nombre.localeCompare(b.nombre, "es");
      if (orden === "ventas") return b.uso.ventas - a.uso.ventas;
      if (orden === "atencion") return peso(a) - peso(b) || b.created_at.localeCompare(a.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [comercios, busqueda, estado, plan, rapido, orden, precios]);

  const hayFiltros = busqueda.trim() !== "" || estado !== "todos" || plan !== "todos" || rapido !== "todos";
  const limpiar = () => {
    setBusqueda("");
    setEstado("todos");
    setPlan("todos");
    setRapido("todos");
  };

  const seleccionado = comercios.find((c) => c.id === administrando) ?? null;
  const resumen = resumenDe(comercios, precios);
  const inicial = (nombre || email).charAt(0).toUpperCase();

  return (
    <main className="bg-mesh min-h-screen bg-muted/20">
      <header className="glass sticky top-0 z-10 border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grad-brand shadow-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Superadmin</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">MultiComercioPanel · todos los comercios del SaaS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-border/70 bg-card/60 p-0.5" role="tablist" aria-label="Vista">
              <button
                type="button" role="tab" aria-selected={vista === "comercios"} onClick={() => setVista("comercios")}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", vista === "comercios" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <Building2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Comercios</span>
              </button>
              <button
                type="button" role="tab" aria-selected={vista === "metricas"} onClick={() => setVista("metricas")}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", vista === "metricas" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <BarChart3 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Métricas</span>
              </button>
            </div>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={refrescar} disabled={refrescando || loading} title="Actualizar">
              <RefreshCw className={cn("h-4 w-4", refrescando && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPlanesOpen(true)}>
              <CircleDollarSign className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Planes</span>
            </Button>
            <div className="ml-1 hidden items-center gap-2 border-l border-border/60 pl-3 md:flex" title={email}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{inicial}</span>
              <span className="max-w-[10rem] truncate text-sm text-muted-foreground">{nombre}</span>
            </div>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={onLogout} title="Cerrar sesión">
              <LogOut className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <div className={cn("mx-auto max-w-6xl space-y-5 p-4 sm:p-6", vista !== "comercios" && "hidden")}>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : (
          <Resumen comercios={comercios} precios={precios} activo={rapido} onFiltro={setRapido} />
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, slug o teléfono"
                className="h-10 rounded-2xl bg-card/70 pl-9"
              />
            </div>
            <select value={plan} onChange={(e) => setPlan(e.target.value as FiltroPlan)} className={selectClase} aria-label="Plan">
              <option value="todos">Todos los planes</option>
              {(Object.keys(PLAN_LABEL) as Comercio["plan"][]).map((p) => <option key={p} value={p}>Plan {PLAN_LABEL[p]}</option>)}
            </select>
            <div className="relative">
              <ArrowDownAZ className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={cn(selectClase, "pl-8")} aria-label="Orden">
                {(Object.keys(ORDEN_LABEL) as Orden[]).map((o) => <option key={o} value={o}>{ORDEN_LABEL[o]}</option>)}
              </select>
            </div>
            <Button className="h-10 rounded-2xl" onClick={() => setNuevoOpen(true)}>
              <Plus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Nuevo comercio</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip activo={estado === "todos"} onClick={() => setEstado("todos")}>Todos <Conteo n={porEstado.todos} /></Chip>
            {ESTADOS.map((e) => (
              <Chip key={e} activo={estado === e} onClick={() => setEstado(estado === e ? "todos" : e)}>
                <span className={cn("h-2 w-2 rounded-full", ESTADO_PUNTO[e])} />
                {ESTADO_LABEL[e]} <Conteo n={porEstado[e]} />
              </Chip>
            ))}
            {hayFiltros && (
              <button type="button" onClick={limpiar} className="ml-1 text-xs font-medium text-primary hover:underline">
                Limpiar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {loading ? "" : visibles.length === comercios.length ? `${comercios.length} comercio${comercios.length === 1 ? "" : "s"}` : `${visibles.length} de ${comercios.length}`}
            </span>
          </div>

          {loading ? (
            <ul className="card-premium divide-y divide-border/60 overflow-hidden rounded-2xl">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
                  <Skeleton className="h-8 w-36 rounded-xl" />
                </li>
              ))}
            </ul>
          ) : comercios.length === 0 ? (
            <Vacio
              icono={Building2}
              titulo="Todavía no hay comercios"
              detalle="Creá el primero o esperá a que alguien se registre desde la web."
              accion={<Button className="rounded-2xl" onClick={() => setNuevoOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nuevo comercio</Button>}
            />
          ) : visibles.length === 0 ? (
            <Vacio
              icono={rapido === "atencion" && !hayOtrosFiltros(busqueda, estado, plan) ? ShieldCheck : SearchX}
              titulo={rapido === "atencion" && !hayOtrosFiltros(busqueda, estado, plan) ? "Nada que atender" : "Ningún comercio coincide"}
              detalle={
                rapido === "atencion" && !hayOtrosFiltros(busqueda, estado, plan)
                  ? `Los ${resumen.activos.length + resumen.enPrueba.length} comercios en uso están en orden.`
                  : "Probá con otra búsqueda o sacá algún filtro."
              }
              accion={<Button variant="outline" className="rounded-2xl" onClick={limpiar}>Limpiar filtros</Button>}
            />
          ) : (
            <ul className="card-premium divide-y divide-border/60 overflow-hidden rounded-2xl">
              {visibles.map((c) => (
                <ComercioFila
                  key={c.id} comercio={c} precios={precios} entrando={entrando === c.id}
                  onEntrar={entrar} onAdministrar={(x) => setAdministrando(x.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {vista === "metricas" && (
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          <Metricas />
        </div>
      )}

      <ComercioDialog
        comercio={seleccionado}
        grupos={grupos}
        precios={precios}
        onOpenChange={(o) => !o && setAdministrando(null)}
        onCambio={load}
        onEntrar={entrar}
      />
      <NuevoComercioDialog open={nuevoOpen} onOpenChange={setNuevoOpen} onCreated={load} />
      <PlanesDialog open={planesOpen} onOpenChange={setPlanesOpen} />
    </main>
  );
}

const selectClase = "border-input h-10 rounded-2xl border bg-card/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function hayOtrosFiltros(busqueda: string, estado: FiltroEstado, plan: FiltroPlan): boolean {
  return busqueda.trim() !== "" || estado !== "todos" || plan !== "todos";
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        activo ? "border-primary/50 bg-primary/10 text-primary" : "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Conteo({ n }: { n: number }) {
  return <span className="cifra rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{n}</span>;
}

function Vacio({ icono: Icono, titulo, detalle, accion }: { icono: typeof Building2; titulo: string; detalle: string; accion?: React.ReactNode }) {
  return (
    <div className="card-premium flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icono className="h-6 w-6" />
      </span>
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detalle}</p>
      </div>
      {accion}
    </div>
  );
}
