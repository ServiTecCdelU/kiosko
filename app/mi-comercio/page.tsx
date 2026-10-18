"use client";

// app/mi-comercio/page.tsx — rubro del comercio y pantallas del menu (lib/modulos.ts).
// Solo el dueño (la API lo exige). Cada modulo arranca segun el rubro; lo que se
// prende o apaga aca le gana al rubro.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth, setCurrentUser, getCurrentUser } from "@/hooks/use-auth";
import { RUBROS } from "@/lib/registro";
import { MODULOS, moduloActivo, moduloPorRubro, type ModuloId, type ModulosElegidos } from "@/lib/modulos";
import { apiUrl } from "@/lib/utils/api-url";
import { TiendaConfig } from "@/components/tienda/tienda-config";

export default function MiComercioPage() {
  const { user, rol } = useAuth();
  const [guardando, setGuardando] = useState(false);
  const rubro = user?.rubro;
  const elegidos: ModulosElegidos = user?.modulos ?? {};

  const guardar = async (cambios: { rubro?: string; modulos?: ModulosElegidos }) => {
    setGuardando(true);
    try {
      const res = await fetch(apiUrl("/api/comercio"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      // El menu sale del usuario guardado: se actualiza en el momento.
      const actual = getCurrentUser();
      if (actual) setCurrentUser({ ...actual, rubro: data.rubro ?? undefined, modulos: data.modulos ?? {} });
      toast.success("Guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarModulo = (id: ModuloId, activo: boolean) => {
    const siguiente: ModulosElegidos = { ...elegidos };
    // Si coincide con el rubro no hace falta guardarlo: sigue al rubro si este cambia.
    if (activo === moduloPorRubro(id, rubro)) delete siguiente[id];
    else siguiente[id] = activo;
    void guardar({ modulos: siguiente });
  };

  if (rol && rol !== "admin") {
    return (
      <AppShell title="Mi comercio">
        <p className="text-sm text-muted-foreground">Esta pantalla es solo para el dueño del comercio.</p>
      </AppShell>
    );
  }

  const personalizados = Object.keys(elegidos).length;

  return (
    <AppShell title="Mi comercio">
      <div className="max-w-2xl space-y-6">
        <TiendaConfig />

        <section className="space-y-2 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Rubro</h2>
          <p className="text-sm text-muted-foreground">
            Define las pantallas que aparecen de entrada, los productos típicos y la unidad de venta sugerida.
          </p>
          <select
            value={rubro ?? ""}
            disabled={guardando}
            onChange={(e) => e.target.value && void guardar({ rubro: e.target.value })}
            className="h-10 w-full rounded-2xl border bg-transparent px-3 text-sm sm:w-80"
            aria-label="Rubro del comercio"
          >
            {!rubro && <option value="">Sin rubro (se ven todas las pantallas)</option>}
            {RUBROS.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Pantallas y funciones</h2>
              <p className="text-sm text-muted-foreground">
                Apagá lo que tu comercio no usa: el menú queda más simple para vos y tus empleados.
              </p>
            </div>
            {guardando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <ul className="divide-y">
            {MODULOS.map((m) => {
              const activo = moduloActivo(m.id, rubro, elegidos);
              const porRubro = moduloPorRubro(m.id, rubro);
              return (
                <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{m.nombre}</p>
                    <p className="text-xs text-muted-foreground">{m.descripcion}</p>
                    {m.id in elegidos && (
                      <p className="mt-0.5 text-xs text-amber-600">
                        Elegido por vos (tu rubro lo trae {porRubro ? "prendido" : "apagado"}).
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={activo}
                    disabled={guardando}
                    onCheckedChange={(v) => cambiarModulo(m.id, v)}
                    aria-label={m.nombre}
                  />
                </li>
              );
            })}
          </ul>

          {personalizados > 0 && (
            <Button variant="outline" className="rounded-2xl" disabled={guardando} onClick={() => void guardar({ modulos: {} })}>
              <RotateCcw className="mr-2 h-4 w-4" /> Volver a lo que trae el rubro
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Caja, stock, ventas, clientes, compras y reportes están siempre. Apagar una pantalla no borra nada:
            si la volvés a prender, está todo como lo dejaste.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
