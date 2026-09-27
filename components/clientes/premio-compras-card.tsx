"use client";
// components/clientes/premio-compras-card.tsx — "a la N-ésima compra, premio".
// Cuenta las compras con cliente asociado (las anuladas no cuentan). Admin y
// encargado configuran; cualquiera entrega el premio a quien lo ganó.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Gift, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import {
  CONFIG_INICIAL, canjearPremioCompras, getConfigCompras, getProgresoCompras, guardarConfigCompras,
  type ConfigCompras, type ProgresoCliente,
} from "@/services/fidelidad-service";

interface PremioComprasCardProps {
  puedeConfigurar: boolean;
}

export function PremioComprasCard({ puedeConfigurar }: PremioComprasCardProps) {
  const [config, setConfig] = useState<ConfigCompras>(CONFIG_INICIAL);
  const [progreso, setProgreso] = useState<ProgresoCliente[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState({ activo: false, meta: "5", monto: "0", premio: "" });
  const [guardando, setGuardando] = useState(false);
  const [entregando, setEntregando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const c = await getConfigCompras();
      setConfig(c);
      setProgreso(c.activo ? await getProgresoCompras() : []);
    } catch {
      toast.error("No se pudo cargar el premio por compras");
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirEdicion = () => {
    setBorrador({
      activo: config.activo, meta: String(config.comprasMeta), monto: String(config.montoMinimo), premio: config.premio,
    });
    setEditando(true);
    setAbierto(true);
  };

  const guardar = async () => {
    const meta = Number(borrador.meta);
    const monto = Number(borrador.monto) || 0;
    if (!Number.isInteger(meta) || meta < 2) return toast.error("Las compras para el premio tienen que ser 2 o más");
    if (!borrador.premio.trim()) return toast.error("Escribí cuál es el premio");
    setGuardando(true);
    try {
      await guardarConfigCompras({ activo: borrador.activo, comprasMeta: meta, montoMinimo: monto, premio: borrador.premio.trim() });
      toast.success("Premio por compras guardado");
      setEditando(false);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const entregar = async (p: ProgresoCliente) => {
    setEntregando(p.clienteId);
    try {
      await canjearPremioCompras(p.clienteId);
      toast.success(`Premio entregado a ${p.nombre}`);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo entregar el premio");
    } finally {
      setEntregando(null);
    }
  };

  const conPremio = progreso.filter((p) => p.premiosPendientes > 0);
  const resumen = !config.activo
    ? "Desactivado"
    : `${config.premio} cada ${config.comprasMeta} compras${config.montoMinimo > 0 ? ` de ${formatCurrency(config.montoMinimo)} o más` : ""}`;

  // Sin permiso y sin programa activo no hay nada para mostrar
  if (!config.activo && !puedeConfigurar) return null;

  return (
    <div className="card-premium mb-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setAbierto((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-money/15 text-money">
            <Gift className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">
              Premio por compras
              {conPremio.length > 0 && (
                <span className="ml-2 rounded-full bg-money px-2 py-0.5 text-[11px] font-bold text-white">
                  {conPremio.length} para entregar
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{resumen}</p>
          </div>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        </button>
        {puedeConfigurar && (
          <Button size="sm" variant="outline" className="rounded-xl" onClick={abrirEdicion}>
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Configurar
          </Button>
        )}
      </div>

      {editando && (
        <div className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="premio-activo">Programa activo</Label>
            <Switch id="premio-activo" checked={borrador.activo} onCheckedChange={(v) => setBorrador((b) => ({ ...b, activo: v }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="premio-meta">Compras para ganar</Label>
              <Input id="premio-meta" type="number" inputMode="numeric" min={2} className="rounded-xl"
                value={borrador.meta} onChange={(e) => setBorrador((b) => ({ ...b, meta: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="premio-monto">Monto mínimo por compra ($)</Label>
              <Input id="premio-monto" type="number" inputMode="numeric" min={0} className="rounded-xl"
                value={borrador.monto} onChange={(e) => setBorrador((b) => ({ ...b, monto: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="premio-texto">Premio</Label>
            <Input id="premio-texto" maxLength={120} placeholder="Ej: un café gratis" className="rounded-xl"
              value={borrador.premio} onChange={(e) => setBorrador((b) => ({ ...b, premio: e.target.value }))} />
          </div>
          <p className="text-xs text-muted-foreground">
            Cuenta solo las compras con un cliente cargado en el POS. Al activarlo, las compras empiezan a contar desde hoy.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button className="rounded-xl" disabled={guardando} onClick={guardar}>Guardar</Button>
          </div>
        </div>
      )}

      {abierto && config.activo && !editando && (
        <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
          {progreso.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">Todavía no hay compras con cliente.</li>
          )}
          {progreso.map((p) => (
            <li key={p.clienteId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nombre}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-money" style={{ width: `${(p.comprasEnCiclo / p.comprasMeta) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{p.comprasEnCiclo} de {p.comprasMeta}</span>
                </div>
              </div>
              {p.premiosPendientes > 0 && (
                <Button size="sm" className="shrink-0 rounded-xl" disabled={entregando === p.clienteId} onClick={() => entregar(p)}>
                  <Gift className="mr-1 h-3.5 w-3.5" />
                  Entregar{p.premiosPendientes > 1 ? ` (${p.premiosPendientes})` : ""}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
