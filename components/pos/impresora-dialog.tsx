"use client";

// components/pos/impresora-dialog.tsx — como imprime esta PC: navegador, termica por
// USB (WebUSB), termica por el agente local o Zebra. Incluye ticket de prueba y cajon.
// La configuracion es por PC y por comercio (lib/impresora/config.ts).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer, RefreshCw, Usb, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AGENTE_URL_DEFAULT, MODO_LABEL, guardarConfigImpresora, leerConfigImpresora, modoPuedeAbrirCajon,
  type ConfigImpresora, type ModoImpresora,
} from "@/lib/impresora/config";
import { elegirImpresoraUsb, impresoraUsbGuardada, nombreDispositivo, soportaWebUsb } from "@/lib/impresora/webusb";
import { estadoAgente } from "@/lib/impresora/agente";
import { abrirCajon, imprimirTicketDePrueba } from "@/lib/impresora/imprimir";
import { ticketDePrueba } from "@/lib/impresora/ticket-prueba";
import type { TicketData } from "@/components/pos/ticket-print";

interface ImpresoraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nombreComercio?: string;
  /** Se avisa cada vez que se guarda, para que el POS relea la configuracion. */
  onChanged?: (config: ConfigImpresora) => void;
  /** En modo navegador el ticket de prueba lo imprime el POS con window.print(). */
  onPruebaNavegador?: (ticket: TicketData) => void;
}

const MODOS: { valor: ModoImpresora; ayuda: string }[] = [
  { valor: "navegador", ayuda: "Se abre la ventana de imprimir en cada venta. Sirve con cualquier impresora instalada en Windows, pero no abre el cajón." },
  { valor: "webusb", ayuda: "Chrome o Edge le mandan el ticket directo a la impresora térmica (Epson, Xprinter, 3nStar…). Silencioso, con corte y cajón." },
  { valor: "agente", ayuda: "Un programita en esta PC recibe el ticket y lo manda a la impresora de Windows o de red. Sirve cuando el USB directo no funciona." },
  { valor: "zebra", ayuda: "Ticket ZPL a una Zebra ZD220 compartida en la PC donde corre la app. Solo para instalaciones locales." },
];

export function ImpresoraDialog({ open, onOpenChange, nombreComercio, onChanged, onPruebaNavegador }: ImpresoraDialogProps) {
  const [config, setConfig] = useState<ConfigImpresora>(leerConfigImpresora);
  const [usbNombre, setUsbNombre] = useState<string | null>(null);
  const [agenteEstado, setAgenteEstado] = useState<{ ok: boolean; impresoras: string[]; error?: string } | null>(null);
  const [ocupado, setOcupado] = useState<"usb" | "agente" | "prueba" | "cajon" | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfig(leerConfigImpresora());
    impresoraUsbGuardada().then((d) => setUsbNombre(d ? nombreDispositivo(d) : null));
    setAgenteEstado(null);
  }, [open]);

  const guardar = (parcial: Partial<ConfigImpresora>) => {
    const nueva = { ...config, ...parcial };
    setConfig(nueva);
    guardarConfigImpresora(nueva);
    onChanged?.(nueva);
  };

  const conectarUsb = async () => {
    setOcupado("usb");
    try {
      const d = await elegirImpresoraUsb();
      if (!d) return;
      setUsbNombre(nombreDispositivo(d));
      guardar({ modo: "webusb" });
      toast.success(`Impresora conectada: ${nombreDispositivo(d)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar la impresora");
    } finally {
      setOcupado(null);
    }
  };

  const buscarAgente = async () => {
    setOcupado("agente");
    try {
      const estado = await estadoAgente(config.agenteUrl);
      setAgenteEstado({ ok: estado.ok, impresoras: estado.impresoras });
      if (!config.agenteImpresora && estado.impresoras.length === 1) guardar({ agenteImpresora: estado.impresoras[0] });
    } catch (e) {
      setAgenteEstado({ ok: false, impresoras: [], error: e instanceof Error ? e.message : "No responde" });
    } finally {
      setOcupado(null);
    }
  };

  const probar = async () => {
    setOcupado("prueba");
    try {
      const r = await imprimirTicketDePrueba(nombreComercio, config);
      if (r === "navegador") onPruebaNavegador?.(ticketDePrueba(nombreComercio));
      else toast.success("Ticket de prueba enviado a la impresora");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo imprimir");
    } finally {
      setOcupado(null);
    }
  };

  const abrir = async () => {
    setOcupado("cajon");
    try {
      await abrirCajon(config);
      toast.success("Se mandó la orden de abrir el cajón");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el cajón");
    } finally {
      setOcupado(null);
    }
  };

  const directa = modoPuedeAbrirCajon(config.modo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-4 w-4 text-primary" /> Impresora de tickets</DialogTitle>
          <DialogDescription>
            Cómo imprime esta PC. Se guarda acá, en esta computadora: cada caja puede tener su impresora.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <p className="text-sm font-semibold">Cómo imprimir</p>
          <div className="space-y-1.5">
            {MODOS.map((m) => (
              <label
                key={m.valor}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors ${config.modo === m.valor ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
              >
                <input
                  type="radio"
                  name="modo-impresora"
                  className="mt-0.5 accent-primary"
                  checked={config.modo === m.valor}
                  onChange={() => guardar({ modo: m.valor })}
                />
                <span>
                  <span className="font-medium">{MODO_LABEL[m.valor]}</span>
                  <span className="block text-xs text-muted-foreground">{m.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {config.modo === "webusb" && (
          <section className="space-y-2 rounded-xl border p-3">
            <p className="text-sm font-semibold">Impresora USB</p>
            {!soportaWebUsb() ? (
              <p className="text-sm text-destructive">Este navegador no puede hablar con el USB. Usá Chrome o Edge, o pasá al agente local.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {usbNombre ? <>Conectada: <b className="text-foreground">{usbNombre}</b></> : "Todavía no elegiste la impresora."}
                </p>
                <Button variant="outline" className="h-9 rounded-xl" disabled={ocupado !== null} onClick={conectarUsb}>
                  {ocupado === "usb" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Usb className="mr-1.5 h-4 w-4" />}
                  {usbNombre ? "Cambiar impresora" : "Conectar impresora USB"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Si al imprimir dice que Windows tiene tomada la impresora, usá el agente local (abajo) o reemplazá el driver USB por WinUSB con Zadig.
                </p>
              </>
            )}
          </section>
        )}

        {config.modo === "agente" && (
          <section className="space-y-2 rounded-xl border p-3">
            <p className="text-sm font-semibold">Agente local</p>
            <p className="text-xs text-muted-foreground">
              Hay que tener abierto <code>agente-impresora</code> en esta PC (carpeta <code>herramientas/agente-impresora</code> del sistema, con su instructivo).
            </p>
            <div className="flex gap-2">
              <Input
                value={config.agenteUrl}
                onChange={(e) => guardar({ agenteUrl: e.target.value })}
                onBlur={() => !config.agenteUrl.trim() && guardar({ agenteUrl: AGENTE_URL_DEFAULT })}
                placeholder={AGENTE_URL_DEFAULT}
                className="h-9 rounded-xl font-mono text-xs"
              />
              <Button variant="outline" className="h-9 shrink-0 rounded-xl" disabled={ocupado !== null} onClick={buscarAgente}>
                {ocupado === "agente" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Buscar impresoras
              </Button>
            </div>
            {agenteEstado && (
              agenteEstado.ok
                ? <Badge variant="outline" className="border-primary text-primary">Agente conectado · {agenteEstado.impresoras.length} impresora(s)</Badge>
                : <p className="text-sm text-destructive">{agenteEstado.error}</p>
            )}
            {!!agenteEstado?.impresoras.length && (
              <select
                value={agenteEstado.impresoras.includes(config.agenteImpresora) ? config.agenteImpresora : ""}
                onChange={(e) => e.target.value && guardar({ agenteImpresora: e.target.value })}
                className="h-9 w-full rounded-xl border bg-transparent px-2 text-sm"
                aria-label="Impresora de Windows"
              >
                <option value="">Elegí la impresora…</option>
                {agenteEstado.impresoras.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <Input
              value={config.agenteImpresora}
              onChange={(e) => guardar({ agenteImpresora: e.target.value })}
              placeholder="Nombre en Windows (ej. POS-80) o impresora de red (ej. 192.168.1.50:9100)"
              className="h-9 rounded-xl text-sm"
            />
          </section>
        )}

        {directa && (
          <section className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Ancho del papel</p>
                <p className="text-xs text-muted-foreground">80 mm es el rollo común de supermercado; 58 mm el chico.</p>
              </div>
              <div className="flex rounded-xl border p-0.5">
                {([80, 58] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => guardar({ ancho: a })}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${config.ancho === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {a} mm
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Abrir el cajón al cobrar en efectivo</p>
                <p className="text-xs text-muted-foreground">El cajón va enchufado al conector RJ11 de la impresora.</p>
              </div>
              <Switch checked={config.cajonAlCobrar} onCheckedChange={(v) => guardar({ cajonAlCobrar: v })} aria-label="Abrir el cajón al cobrar en efectivo" />
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button className="h-9 rounded-xl" disabled={ocupado !== null} onClick={probar}>
            {ocupado === "prueba" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
            Imprimir ticket de prueba
          </Button>
          {directa && (
            <Button variant="outline" className="h-9 rounded-xl" disabled={ocupado !== null} onClick={abrir}>
              {ocupado === "cajon" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wallet className="mr-1.5 h-4 w-4" />}
              Abrir cajón
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
