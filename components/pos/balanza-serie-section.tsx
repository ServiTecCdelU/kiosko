"use client";

// components/pos/balanza-serie-section.tsx — balanza conectada a la PC (Web Serial).
// Va dentro de "Impresora y balanza". Elegir marca, conectar el puerto, detectar el
// protocolo (se prueban en orden, como pide el manual de Systel) y ver lo que llega.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plug, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BAUDIOS, MARCAS_BALANZA, PROTOCOLOS, type LecturaPeso } from "@/lib/balanza-serie";
import { guardarConfigBalanzaSerie, leerConfigBalanzaSerie, type ConfigBalanzaSerie } from "@/lib/balanza-config";
import {
  detectarProtocoloBalanza, elegirPuertoBalanza, leerPesoBalanza, nombrePuerto, puertoBalanzaGuardado,
  soportaBalanzaSerie, ultimosBytes,
} from "@/lib/balanza-puerto";
import { cantidadTexto } from "@/lib/cantidad";

const SELECT = "h-9 w-full rounded-xl border bg-transparent px-2 text-sm";

function describir(l: LecturaPeso): string {
  if (l.tipo === "peso") return `${cantidadTexto(l.kg, "kg")}${l.estable ? "" : " (inestable)"}`;
  if (l.tipo === "inestable") return "Responde, pero el peso está inestable (sacá la mano del plato)";
  if (l.tipo === "error") return l.motivo;
  return "No respondió";
}

export function BalanzaSerieSection() {
  const [config, setConfig] = useState<ConfigBalanzaSerie>(leerConfigBalanzaSerie);
  const [puerto, setPuerto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"conectar" | "detectar" | "leer" | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [bytes, setBytes] = useState<string>("");

  useEffect(() => {
    if (!soportaBalanzaSerie()) return;
    puertoBalanzaGuardado().then((p) => setPuerto(p ? nombrePuerto(p) : null));
  }, []);

  const guardar = (parcial: Partial<ConfigBalanzaSerie>) => {
    const nueva = { ...config, ...parcial };
    setConfig(nueva);
    guardarConfigBalanzaSerie(nueva);
  };

  const mostrarBytes = () => setBytes(ultimosBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "));

  const conectar = async () => {
    setOcupado("conectar");
    try {
      const p = await elegirPuertoBalanza();
      if (p) {
        setPuerto(nombrePuerto(p));
        toast.success("Balanza conectada. Ahora tocá “Detectar y probar” con algo sobre el plato.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar la balanza");
    } finally {
      setOcupado(null);
    }
  };

  const detectar = async () => {
    setOcupado("detectar");
    setResultado(null);
    try {
      const orden = MARCAS_BALANZA.find((m) => m.id === config.marca)?.protocolos ?? PROTOCOLOS.map((p) => p.id);
      const r = await detectarProtocoloBalanza(orden, config.baudRate, config.decimales);
      mostrarBytes();
      if (r) {
        guardar({ protocolo: r.protocolo, activa: true });
        setResultado(`Responde con ${PROTOCOLOS.find((p) => p.id === r.protocolo)?.nombre}: ${describir(r.lectura)}`);
      } else {
        setResultado("No respondió con ningún protocolo. Revisá el cable, que la balanza esté en modo comunicación con PC y probá otra velocidad.");
      }
    } catch (e) {
      setResultado(e instanceof Error ? e.message : "No se pudo leer la balanza");
    } finally {
      setOcupado(null);
    }
  };

  const leer = async () => {
    setOcupado("leer");
    try {
      const l = await leerPesoBalanza(config);
      mostrarBytes();
      setResultado(describir(l));
    } catch (e) {
      setResultado(e instanceof Error ? e.message : "No se pudo leer la balanza");
    } finally {
      setOcupado(null);
    }
  };

  if (!soportaBalanzaSerie()) {
    return (
      <section className="space-y-1 border-t pt-4">
        <p className="text-sm font-semibold">Balanza conectada a la PC</p>
        <p className="text-xs text-muted-foreground">Para leer el peso directo de la balanza usá Chrome o Edge en esta PC.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="h-4 w-4 text-primary" /> Balanza conectada a la PC</p>
          <p className="text-xs text-muted-foreground">
            Por cable RS-232 (con adaptador USB) o USB. Al vender por kg, el peso se lee solo.
          </p>
        </div>
        <Switch
          checked={config.activa} onCheckedChange={(v) => guardar({ activa: v })}
          aria-label="Leer el peso de la balanza al vender por kg"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={config.marca} onChange={(e) => guardar({ marca: e.target.value })} className={SELECT} aria-label="Marca de la balanza">
          {MARCAS_BALANZA.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <Button variant="outline" className="h-9 rounded-xl" disabled={ocupado !== null} onClick={conectar}>
          {ocupado === "conectar" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plug className="mr-1.5 h-4 w-4" />}
          {puerto ? "Cambiar puerto" : "Conectar balanza"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {puerto ? <>Puerto: <b className="text-foreground">{puerto}</b></> : "Todavía no elegiste el puerto de la balanza."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button className="h-9 rounded-xl" disabled={!puerto || ocupado !== null} onClick={detectar}>
          {ocupado === "detectar" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Detectar y probar
        </Button>
        <Button variant="outline" className="h-9 rounded-xl" disabled={!puerto || ocupado !== null} onClick={leer}>
          {ocupado === "leer" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Leer peso
        </Button>
      </div>
      {resultado && (
        <p className={cn("rounded-xl px-3 py-2 text-sm", resultado.startsWith("Responde") || /kg/.test(resultado) ? "bg-money/10 text-money" : "bg-muted text-muted-foreground")}>
          {resultado}
        </p>
      )}

      <details className="rounded-xl border px-3 py-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ajustes avanzados</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="text-xs">Protocolo
            <select value={config.protocolo} onChange={(e) => guardar({ protocolo: e.target.value as ConfigBalanzaSerie["protocolo"] })} className={SELECT}>
              {PROTOCOLOS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs">Velocidad
            <select value={config.baudRate} onChange={(e) => guardar({ baudRate: Number(e.target.value) })} className={SELECT}>
              {BAUDIOS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="text-xs">Números sin coma
            <select value={config.decimales} onChange={(e) => guardar({ decimales: Number(e.target.value) })} className={SELECT}>
              <option value={3}>son gramos</option>
              <option value={2}>2 decimales</option>
              <option value={1}>1 decimal</option>
              <option value={0}>son kg</option>
            </select>
          </label>
        </div>
        {bytes && <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">Recibido: {bytes}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Systel: 9600 baudios, 8 bits, sin paridad. Si la balanza tiene un modo “comunicación con PC” o “a pedido”, activalo en su menú.
        </p>
      </details>
    </section>
  );
}
