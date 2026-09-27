"use client";
// components/clientes/sorteos-card.tsx — sorteos entre clientes: cada compra con
// cliente suma chances y el sorteo se hace en el servidor (no se puede repetir).
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Dices, PartyPopper, Plus, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { hoyArgentinaISO, sumarDias } from "@/lib/oferta-vigencia";
import {
  cancelarSorteo, crearSorteo, getParticipantes, getSorteos, sortear,
  type Ganador, type Participante, type Sorteo,
} from "@/services/fidelidad-service";

interface SorteosCardProps {
  puedeGestionar: boolean;
}

const DIAS_SORTEO_POR_DEFECTO = 30;

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formularioInicial() {
  const hoy = hoyArgentinaISO();
  return { nombre: "", premio: "", desde: hoy, hasta: sumarDias(hoy, DIAS_SORTEO_POR_DEFECTO), monto: "0" };
}

export function SorteosCard({ puedeGestionar }: SorteosCardProps) {
  const [sorteos, setSorteos] = useState<Sorteo[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(formularioInicial);
  const [enviando, setEnviando] = useState(false);
  const [verId, setVerId] = useState<string | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [ganador, setGanador] = useState<{ sorteoId: string; datos: Ganador } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setSorteos(await getSorteos());
    } catch {
      setSorteos([]); // es un extra: si falla, no se muestra
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    const monto = Number(form.monto) || 0;
    if (!form.nombre.trim() || !form.premio.trim()) return toast.error("Completá el nombre y el premio");
    if (form.hasta < form.desde) return toast.error("La fecha de cierre no puede ser anterior a la de inicio");
    setEnviando(true);
    try {
      await crearSorteo({ nombre: form.nombre.trim(), premio: form.premio.trim(), desde: form.desde, hasta: form.hasta, montoPorChance: monto });
      toast.success("Sorteo creado");
      setCreando(false);
      setForm(formularioInicial());
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el sorteo");
    } finally {
      setEnviando(false);
    }
  };

  const verParticipantes = async (id: string) => {
    if (verId === id) return setVerId(null);
    setVerId(id);
    setParticipantes([]);
    try {
      setParticipantes(await getParticipantes(id));
    } catch {
      toast.error("No se pudieron cargar los participantes");
    }
  };

  const hacerSorteo = async (s: Sorteo) => {
    setEnviando(true);
    try {
      const datos = await sortear(s.id);
      setGanador({ sorteoId: s.id, datos });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo hacer el sorteo");
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (s: Sorteo) => {
    try {
      await cancelarSorteo(s.id);
      toast.success("Sorteo cancelado");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar");
    }
  };

  if (sorteos.length === 0 && !puedeGestionar) return null;

  const abiertos = sorteos.filter((s) => s.estado === "abierto").length;
  const hoy = hoyArgentinaISO();

  return (
    <div className="card-premium mb-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setAbierto((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Trophy className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Sorteos</p>
            <p className="truncate text-xs text-muted-foreground">
              {abiertos > 0 ? `${abiertos} abierto${abiertos > 1 ? "s" : ""}` : "Ninguno abierto"} · cada compra con cliente suma chances
            </p>
          </div>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        </button>
        {puedeGestionar && (
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setCreando((v) => !v); setAbierto(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo sorteo
          </Button>
        )}
      </div>

      {creando && (
        <div className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sorteo-nombre">Nombre</Label>
              <Input id="sorteo-nombre" maxLength={120} placeholder="Ej: Sorteo del Día del Niño" className="rounded-xl"
                value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sorteo-premio">Premio</Label>
              <Input id="sorteo-premio" maxLength={120} placeholder="Ej: canasta de $30.000" className="rounded-xl"
                value={form.premio} onChange={(e) => setForm((f) => ({ ...f, premio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sorteo-desde">Compras desde</Label>
              <Input id="sorteo-desde" type="date" className="rounded-xl"
                value={form.desde} onChange={(e) => setForm((f) => ({ ...f, desde: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sorteo-hasta">Hasta</Label>
              <Input id="sorteo-hasta" type="date" className="rounded-xl"
                value={form.hasta} onChange={(e) => setForm((f) => ({ ...f, hasta: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sorteo-monto">Cada cuántos $ suma una chance</Label>
            <Input id="sorteo-monto" type="number" inputMode="numeric" min={0} className="rounded-xl"
              value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} />
            <p className="text-xs text-muted-foreground">
              {Number(form.monto) > 0
                ? `Una compra de ${formatCurrency(Number(form.monto) * 2)} vale 2 chances. Las menores a ${formatCurrency(Number(form.monto))} no suman.`
                : "En 0, cada compra vale 1 chance sin importar el monto."}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setCreando(false)}>Cancelar</Button>
            <Button className="rounded-xl" disabled={enviando} onClick={crear}>Crear sorteo</Button>
          </div>
        </div>
      )}

      {abierto && (
        <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
          {sorteos.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">Todavía no hiciste ningún sorteo.</li>}
          {sorteos.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.nombre} · <span className="text-muted-foreground">{s.premio}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}
                    {s.estado === "abierto" && s.hasta >= hoy && " · en curso"}
                    {s.estado === "abierto" && s.hasta < hoy && " · listo para sortear"}
                    {s.estado === "sorteado" && s.ganadorNombre && ` · ganó ${s.ganadorNombre}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => verParticipantes(s.id)}>
                    <Users className="mr-1 h-3.5 w-3.5" /> Participantes
                  </Button>
                  {s.estado === "abierto" && puedeGestionar && (
                    <>
                      <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => cancelar(s)}>Cancelar</Button>
                      <Button size="sm" className="rounded-xl" disabled={enviando} onClick={() => hacerSorteo(s)}>
                        <Dices className="mr-1 h-3.5 w-3.5" /> Sortear
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {ganador?.sorteoId === s.id && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-money/10 p-4">
                  <PartyPopper className="h-8 w-8 shrink-0 text-money" />
                  <div>
                    <p className="text-xs text-muted-foreground">Ganador de {s.premio}</p>
                    <p className="text-lg font-bold">{ganador.datos.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {ganador.datos.telefono ? `Tel. ${ganador.datos.telefono} · ` : ""}entre {ganador.datos.chancesTotal} chances
                    </p>
                  </div>
                </div>
              )}

              {verId === s.id && (
                <ul className="mt-2 rounded-xl bg-muted/30 px-3 py-1">
                  {participantes.length === 0 && (
                    <li className="py-2 text-xs text-muted-foreground">Todavía no participa nadie en estas fechas.</li>
                  )}
                  {participantes.map((p) => (
                    <li key={p.clienteId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="truncate">{p.nombre}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.compras} compra{p.compras > 1 ? "s" : ""} · <span className="font-semibold text-foreground">{p.chances} chances</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
