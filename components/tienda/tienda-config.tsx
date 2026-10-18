"use client";

// components/tienda/tienda-config.tsx — "Tienda online" en Mi comercio (plan Tienda).
// Abrir/pausar, WhatsApp de pedidos, bienvenida, entrega y stock; link y QR para
// compartir. Sin el plan, explica que es y manda a Suscripcion.
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/lib/utils/api-url";
import { conBase } from "@/lib/site";
import { numeroWhatsapp, type ConfigTienda } from "@/lib/tienda";

export function TiendaConfig() {
  const [slug, setSlug] = useState<string | null>(null);
  const [enPlan, setEnPlan] = useState<boolean | null>(null);
  const [config, setConfig] = useState<ConfigTienda | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/comercio"))
      .then((r) => r.json())
      .then((d) => {
        setSlug(d.slug ?? null);
        setEnPlan(!!d.tiendaEnPlan);
        setConfig(d.tienda ?? null);
      })
      .catch(() => toast.error("No se pudo cargar la tienda"));
  }, []);

  const link = slug && typeof window !== "undefined" ? `${window.location.origin}${conBase(`/tienda/${slug}`)}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 512, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [link]);

  if (enPlan === null || !config) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!enPlan) {
    return (
      <section className="space-y-2 rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-primary" /> Tienda online</h2>
        <p className="text-sm text-muted-foreground">
          Tus clientes ven tus productos, precios y ofertas desde el celular y te mandan el pedido por WhatsApp.
          Todo sale de tu stock: si cambiás un precio, la tienda ya lo muestra.
        </p>
        <Button asChild className="rounded-2xl"><Link href="/suscripcion">Ver el plan Tienda</Link></Button>
      </section>
    );
  }

  const cambiar = (parcial: Partial<ConfigTienda>) => setConfig((c) => (c ? { ...c, ...parcial } : c));
  const whatsappOk = !!numeroWhatsapp(config.whatsapp);

  const guardar = async (siguiente: ConfigTienda = config) => {
    setGuardando(true);
    try {
      const res = await fetch(apiUrl("/api/comercio"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tienda: siguiente }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      setConfig(data.tienda);
      toast.success(data.tienda.activa ? "Tienda guardada y abierta" : "Tienda guardada (cerrada)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-primary" /> Tienda online</h2>
          <p className="text-sm text-muted-foreground">Tus clientes eligen productos y te llega el pedido por WhatsApp.</p>
        </div>
        <Switch
          checked={config.activa}
          disabled={guardando}
          onCheckedChange={(v) => void guardar({ ...config, activa: v })}
          aria-label="Tienda abierta"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">WhatsApp para los pedidos</span>
          <Input value={config.whatsapp} onChange={(e) => cambiar({ whatsapp: e.target.value })} placeholder="343 456-7890" className="rounded-xl" />
          {config.whatsapp && !whatsappOk && <span className="text-xs text-amber-600">Poné la característica: ej. 343 456-7890</span>}
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Mensaje de bienvenida (opcional)</span>
          <Input value={config.mensaje} onChange={(e) => cambiar({ mensaje: e.target.value })} placeholder="Envíos sin cargo desde $20.000" className="rounded-xl" />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><Switch checked={config.retiro} onCheckedChange={(v) => cambiar({ retiro: v })} /> Retiro en el local</label>
        <label className="flex items-center gap-2"><Switch checked={config.envio} onCheckedChange={(v) => cambiar({ envio: v })} /> Envío a domicilio</label>
        <label className="flex items-center gap-2"><Switch checked={config.mostrarSinStock} onCheckedChange={(v) => cambiar({ mostrarSinStock: v })} /> Mostrar productos sin stock</label>
      </div>

      <Button className="rounded-2xl" disabled={guardando} onClick={() => void guardar()}>
        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
      </Button>

      {link && (
        <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center">
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR de la tienda" className="h-32 w-32 rounded-xl border" />
          )}
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Link de tu tienda {config.activa ? "" : "(cerrada: abrila con el interruptor)"}</p>
            <p className="break-all text-sm font-medium">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-xl" onClick={copiar}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link</Button>
              <Button size="sm" variant="outline" className="rounded-xl" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ver tienda</a>
              </Button>
              {qr && (
                <Button size="sm" variant="outline" className="rounded-xl" asChild>
                  <a href={qr} download={`tienda-${slug}.png`}><Download className="mr-1.5 h-3.5 w-3.5" /> Descargar QR</a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Imprimí el QR y pegalo en el mostrador, o compartí el link en tus estados de WhatsApp e Instagram.</p>
          </div>
        </div>
      )}
    </section>
  );
}
