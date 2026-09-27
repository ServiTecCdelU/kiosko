"use client";

// app/superadmin/page.tsx — panel de superadmin: ver y administrar todos los
// comercios del SaaS. Item 5.2 del plan maestro.
// No usa AppShell/hooks/use-auth.ts a proposito: ese es el estado de UN
// comercio; esta pantalla no pertenece a ninguno. La excepcion es "Entrar":
// ahi se carga el usuario de soporte en use-auth para abrir el panel del comercio.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, LogOut, Loader2, Chrome, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuperadmin } from "@/hooks/use-superadmin";
import { setCurrentUser } from "@/hooks/use-auth";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiUrl } from "@/lib/utils/api-url";
import { ComercioFila } from "@/components/superadmin/comercio-fila";
import { ComercioDialog } from "@/components/superadmin/comercio-dialog";
import { NuevoComercioDialog } from "@/components/superadmin/nuevo-comercio-dialog";
import { superadminApi, type Comercio } from "@/components/superadmin/comun";

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
        <div className="flex flex-col items-center gap-3">
          <div className="grad-brand shadow-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white">
            <Building2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de superadmin</h1>
          <p className="text-sm text-muted-foreground">Acceso restringido</p>
        </div>
        <button
          onClick={entrarConGoogle}
          disabled={entrando}
          className="flex w-full max-w-[260px] items-center justify-center gap-2 rounded-2xl border bg-card py-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
          Entrar con Google
        </button>
      </main>
    );
  }

  return <Panel nombre={user.nombre} onLogout={logout} />;
}

function Panel({ nombre, onLogout }: { nombre: string; onLogout: () => void }) {
  const router = useRouter();
  const [comercios, setComercios] = useState<Comercio[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [administrando, setAdministrando] = useState<string | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { comercios } = await superadminApi<{ comercios: Comercio[] }>({ accion: "listar" });
      setComercios(comercios ?? []);
    } catch {
      toast.error("No se pudieron cargar los comercios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo entrar al comercio");
      setEntrando(null);
    }
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = q ? comercios.filter((c) => `${c.nombre} ${c.slug}`.toLowerCase().includes(q)) : comercios;
  const seleccionado = comercios.find((c) => c.id === administrando) ?? null;

  return (
    <main className="bg-mesh min-h-screen bg-muted/20">
      <div className="glass sticky top-0 z-10 flex items-center justify-between border-b border-border/60 px-4 py-3.5 sm:px-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Building2 className="h-5 w-5 text-primary" /> Superadmin
        </h1>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{nombre}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="mr-1.5 h-4 w-4" /> Salir
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar entre ${comercios.length} comercio${comercios.length === 1 ? "" : "s"}`}
              className="rounded-2xl pl-9"
            />
          </div>
          <Button className="rounded-2xl" onClick={() => setNuevoOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo comercio
          </Button>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {comercios.length === 0 ? "Sin comercios todavía" : "Ningún comercio coincide con la búsqueda"}
          </p>
        ) : (
          <ul className="card-premium divide-y divide-border/60 overflow-hidden rounded-2xl">
            {visibles.map((c) => (
              <ComercioFila
                key={c.id} comercio={c} entrando={entrando === c.id}
                onEntrar={entrar} onAdministrar={(x) => setAdministrando(x.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <ComercioDialog
        comercio={seleccionado}
        onOpenChange={(o) => !o && setAdministrando(null)}
        onCambio={load}
        onEntrar={entrar}
      />
      <NuevoComercioDialog open={nuevoOpen} onOpenChange={setNuevoOpen} onCreated={load} />
    </main>
  );
}
