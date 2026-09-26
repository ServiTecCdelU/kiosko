"use client";

// app/superadmin/page.tsx — panel de superadmin: ver y administrar todos los
// comercios del SaaS. Item 5.2 del plan maestro.
// No usa AppShell/hooks/use-auth.ts a proposito: ese es el estado de UN
// comercio; esta pantalla no pertenece a ninguno.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, LogOut, Loader2, Chrome, Plus, Package, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { useSuperadmin } from "@/hooks/use-superadmin";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { apiUrl } from "@/lib/utils/api-url";

interface ComercioUso {
  productos: number;
  ventas: number;
  usuarios: number;
}

interface Comercio {
  id: string;
  nombre: string;
  slug: string;
  estado: "activo" | "prueba" | "suspendido" | "baja";
  plan: "free" | "basico" | "pro";
  trial_hasta: string | null;
  suscripcion_hasta: string | null;
  created_at: string;
  uso: ComercioUso;
}

const ESTADO_COLOR: Record<Comercio["estado"], string> = {
  activo: "border-success/50 text-success",
  prueba: "border-warning text-warning",
  suspendido: "border-destructive/50 text-destructive",
  baja: "border-muted-foreground text-muted-foreground",
};

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
  const [comercios, setComercios] = useState<Comercio[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoOpen, setNuevoOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/superadmin/comercios"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "listar" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setComercios(data.comercios ?? []);
    } catch {
      toast.error("No se pudieron cargar los comercios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cambiarCampo = async (id: string, cambios: Record<string, unknown>) => {
    try {
      const res = await fetch(apiUrl("/api/superadmin/comercios"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...cambios }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      toast.success("Comercio actualizado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  return (
    <main className="bg-mesh min-h-screen bg-muted/20">
      <div className="glass sticky top-0 z-10 flex items-center justify-between border-b border-border/60 px-4 py-3.5 sm:px-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Building2 className="h-5 w-5 text-primary" /> Superadmin
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{nombre}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="mr-1.5 h-4 w-4" /> Salir
          </Button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {comercios.length} comercio{comercios.length === 1 ? "" : "s"}
          </p>
          <Button className="rounded-2xl" onClick={() => setNuevoOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo comercio
          </Button>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : comercios.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sin comercios todavía</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {comercios.map((c) => (
              <ComercioCard key={c.id} comercio={c} onCambiar={cambiarCampo} />
            ))}
          </div>
        )}
      </div>

      <NuevoComercioDialog open={nuevoOpen} onOpenChange={setNuevoOpen} onCreated={load} />
    </main>
  );
}

function ComercioCard({
  comercio, onCambiar,
}: {
  comercio: Comercio;
  onCambiar: (id: string, cambios: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="card-premium rounded-2xl p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{comercio.nombre}</p>
          <p className="text-xs text-muted-foreground">{comercio.slug} · desde {formatDate(comercio.created_at)}</p>
        </div>
        <Badge variant="outline" className={cn(ESTADO_COLOR[comercio.estado])}>{comercio.estado}</Badge>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/50 py-2">
          <Package className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
          <p className="cifra text-sm font-bold">{comercio.uso.productos}</p>
          <p className="text-[10px] text-muted-foreground">productos</p>
        </div>
        <div className="rounded-xl bg-muted/50 py-2">
          <Receipt className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
          <p className="cifra text-sm font-bold">{comercio.uso.ventas}</p>
          <p className="text-[10px] text-muted-foreground">ventas</p>
        </div>
        <div className="rounded-xl bg-muted/50 py-2">
          <Users className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
          <p className="cifra text-sm font-bold">{comercio.uso.usuarios}</p>
          <p className="text-[10px] text-muted-foreground">empleados</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="mb-1 block text-[10px] uppercase text-muted-foreground">Estado</Label>
          <select
            value={comercio.estado}
            onChange={(e) => onCambiar(comercio.id, { estado: e.target.value })}
            className="border-input h-8 w-full rounded-lg border bg-transparent px-2 text-xs outline-none"
          >
            <option value="prueba">Prueba</option>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div>
          <Label className="mb-1 block text-[10px] uppercase text-muted-foreground">Plan</Label>
          <select
            value={comercio.plan}
            onChange={(e) => onCambiar(comercio.id, { plan: e.target.value })}
            className="border-input h-8 w-full rounded-lg border bg-transparent px-2 text-xs outline-none"
          >
            <option value="free">Free</option>
            <option value="basico">Básico</option>
            <option value="pro">Pro</option>
          </select>
        </div>
      </div>

      {comercio.trial_hasta && (
        <p className="mt-2 text-xs text-muted-foreground">
          Prueba hasta {formatDate(comercio.trial_hasta)}
        </p>
      )}
      {comercio.suscripcion_hasta && (
        <p className="text-xs text-muted-foreground">
          Suscripción hasta {formatDate(comercio.suscripcion_hasta)}
        </p>
      )}
    </div>
  );
}

function NuevoComercioDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [trialDias, setTrialDias] = useState("14");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre("");
      setSlug("");
      setTrialDias("14");
    }
  }, [open]);

  const handleCrear = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/superadmin/comercios"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "crear", nombre: nombre.trim(), slug: slug.trim(), trialDias: Number(trialDias) || 14,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      toast.success(`Comercio "${nombre}" creado`);
      onOpenChange(false);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el comercio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo comercio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" autoFocus />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Slug (opcional, se genera solo)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-xl" placeholder="mi-comercio" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Días de prueba</Label>
            <Input
              type="number" inputMode="numeric" value={trialDias}
              onChange={(e) => setTrialDias(e.target.value)} className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={saving || !nombre.trim()} onClick={handleCrear}>
            {saving ? "Creando..." : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
