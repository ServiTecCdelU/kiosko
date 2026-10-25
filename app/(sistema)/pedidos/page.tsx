"use client";

// app/pedidos/page.tsx — pedidos de la tienda online (plan Tienda, etapa 2).
// Llegan desde /tienda/<slug>; aca se preparan, se avisa al cliente por WhatsApp y se
// pasan a venta en la caja (/pos?pedido=<id>), donde se pesa y se cobra.
// Spec: docs/superpowers/specs/2026-10-18-plan-tienda-design.md
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bike, MessageCircle, RefreshCw, ShoppingCart, Store } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { useAuth } from "@/hooks/use-auth";
import { planIncluyeTienda } from "@/lib/suscripcion";
import {
  ESTADO_PEDIDO_LABEL, mensajeEstadoPedido, puedePasarA, urlWhatsapp, type EstadoPedido,
} from "@/lib/tienda";
import { cambiarEstadoPedido, entregarPedidoPagado, listarPedidos, type Pedido } from "@/services/pedidos-service";

const CADA_MS = 20_000;

type Vista = "activos" | "entregado" | "cancelado";

const ESTADO_CLASE: Record<EstadoPedido, string> = {
  nuevo: "border-red-500 bg-red-500/10 text-red-600",
  preparando: "border-amber-500 bg-amber-500/10 text-amber-700",
  listo: "border-primary bg-primary/10 text-primary",
  entregado: "border-border text-muted-foreground",
  cancelado: "border-border text-muted-foreground line-through",
};

const PAGO_LABEL = { efectivo: "Efectivo", transferencia: "Transferencia", mercadopago: "Mercado Pago" } as const;

function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

const cantidadTexto = (q: number, unidad: string) =>
  unidad === "un" ? `${q} x` : `${String(q).replace(".", ",")} ${unidad}`;

/** Un "ding" corto sin archivos de audio (si el navegador lo permite). */
function sonar() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Sin audio: queda el aviso visual.
  }
}

export default function PedidosPage() {
  const { user } = useAuth();
  const [vista, setVista] = useState<Vista>("activos");
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const vistos = useRef<Set<string> | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    try {
      const lista = await listarPedidos(vista === "activos" ? undefined : vista);
      setPedidos(lista);
      if (vista === "activos") {
        const nuevos = lista.filter((p) => p.estado === "nuevo").map((p) => p.id);
        // Suena solo si aparece uno que no estaba (no al abrir la pantalla).
        if (vistos.current && nuevos.some((id) => !vistos.current!.has(id))) {
          sonar();
          toast.success("¡Entró un pedido nuevo!");
        }
        vistos.current = new Set(nuevos);
      }
    } catch (e) {
      if (!silencioso) toast.error(e instanceof Error ? e.message : "No se pudieron cargar los pedidos");
    }
  }, [vista]);

  useEffect(() => {
    setPedidos(null);
    void cargar();
    const t = setInterval(() => void cargar(true), CADA_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const entregar = async (p: Pedido) => {
    setOcupado(p.id);
    try {
      const r = await entregarPedidoPagado(p.id);
      toast.success(`Pedido N° ${p.numero} entregado`, { description: `Venta N° ${r.saleNumber} por ${formatCurrency(r.total)} (Mercado Pago)` });
      await cargar(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la entrega");
    } finally {
      setOcupado(null);
    }
  };

  const cambiar = async (p: Pedido, estado: EstadoPedido) => {
    setOcupado(p.id);
    try {
      await cambiarEstadoPedido(p.id, estado);
      toast.success(`Pedido N° ${p.numero}: ${ESTADO_PEDIDO_LABEL[estado].toLowerCase()}`);
      await cargar(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el pedido");
    } finally {
      setOcupado(null);
    }
  };

  const enPlan = !user?.plan || planIncluyeTienda(user.plan);

  return (
    <AppShell title="Pedidos">
      {!enPlan && (
        <p className="mb-4 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          Los pedidos llegan desde la tienda online, que es del plan Tienda.{" "}
          <Link href="/suscripcion" className="font-medium text-primary">Ver el plan</Link>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([["activos", "Para atender"], ["entregado", "Entregados"], ["cancelado", "Cancelados"]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              vista === v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto rounded-xl" onClick={() => void cargar()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Actualizar
        </Button>
      </div>

      {!pedidos ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      ) : pedidos.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {vista === "activos"
            ? "No hay pedidos para atender. Cuando un cliente pida desde tu tienda online, aparece acá y suena un aviso."
            : "No hay pedidos en esta lista."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pedidos.map((p) => (
            <TarjetaPedido
              key={p.id}
              p={p}
              comercio={user?.comercioNombre ?? "el comercio"}
              ocupado={ocupado === p.id}
              onCambiar={(e) => void cambiar(p, e)}
              onEntregar={() => void entregar(p)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function TarjetaPedido({ p, comercio, ocupado, onCambiar, onEntregar }: {
  p: Pedido;
  comercio: string;
  ocupado: boolean;
  onCambiar: (e: EstadoPedido) => void;
  onEntregar: () => void;
}) {
  const pagado = p.pagoEstado === "aprobado";
  const aviso = mensajeEstadoPedido(p.estado, p.numero, comercio, p.entrega, p.clienteNombre);
  const hayPesables = p.items.some((i) => i.unidad !== "un");
  const activo = p.estado !== "entregado" && p.estado !== "cancelado";

  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", p.estado === "nuevo" && "border-red-500/60 shadow-sm")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">Pedido N° {p.numero}</p>
          <p className="text-xs text-muted-foreground">{haceCuanto(p.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={ESTADO_CLASE[p.estado]}>{ESTADO_PEDIDO_LABEL[p.estado]}</Badge>
          {pagado && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Pagado online {formatCurrency(p.pagoMonto ?? p.total)}</Badge>
          )}
          {p.pagoEstado === "pendiente" && <Badge variant="outline" className="border-amber-500 text-amber-700">Esperando el pago</Badge>}
          {p.pagoEstado === "rechazado" && <Badge variant="outline" className="border-red-500 text-red-600">Pago rechazado</Badge>}
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <p className="font-medium">{p.clienteNombre}</p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          {p.entrega === "envio" ? <Bike className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
          {p.entrega === "envio" ? `Envío a ${p.direccion}` : "Retira en el local"} · {pagado ? "Ya pagó con Mercado Pago" : `Paga con ${PAGO_LABEL[p.pago].toLowerCase()}`}
        </p>
        {p.nota && <p className="rounded-xl bg-muted px-3 py-1.5 text-xs">Nota: {p.nota}</p>}
      </div>

      <ul className="space-y-0.5 border-t pt-2 text-sm">
        {p.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-2">
            <span><b>{cantidadTexto(i.quantity, i.unidad)}</b> {i.name}</span>
            <span className="text-muted-foreground">{formatCurrency(i.subtotal)}</span>
          </li>
        ))}
        <li className="flex justify-between border-t pt-1 font-semibold">
          <span>Total{hayPesables && !pagado ? " aprox." : ""}</span>
          <span>{formatCurrency(p.total)}</span>
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        {activo && pagado && (
          <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={ocupado} onClick={onEntregar}
            title="Registra la venta al precio pagado online, sin volver a cobrar">
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Entregar (ya pagó)
          </Button>
        )}
        {activo && !pagado && (
          <Button asChild size="sm" className="rounded-xl">
            <Link href={`/pos?pedido=${encodeURIComponent(p.id)}`}><ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Pasar a venta</Link>
          </Button>
        )}
        {puedePasarA(p.estado, "preparando") && (
          <Button size="sm" variant="outline" className="rounded-xl" disabled={ocupado} onClick={() => onCambiar("preparando")}>Preparando</Button>
        )}
        {puedePasarA(p.estado, "listo") && (
          <Button size="sm" variant="outline" className="rounded-xl" disabled={ocupado} onClick={() => onCambiar("listo")}>
            {p.entrega === "envio" ? "Listo para enviar" : "Listo para retirar"}
          </Button>
        )}
        {p.estado === "listo" && !pagado && (
          <Button size="sm" variant="outline" className="rounded-xl" disabled={ocupado} onClick={() => onCambiar("entregado")}
            title="Si lo cobraste por fuera de la caja">
            Entregado sin cobrar acá
          </Button>
        )}
        {aviso && (
          <Button asChild size="sm" variant="outline" className="rounded-xl border-[#25D366]/60 text-[#128C7E]">
            <a href={urlWhatsapp(p.clienteTelefono, aviso)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Avisar por WhatsApp
            </a>
          </Button>
        )}
        {activo && (
          <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" disabled={ocupado}
            onClick={() => {
              const aviso = pagado
                ? `¿Cancelar el pedido N° ${p.numero}? Ya lo pagó online: devolvele ${formatCurrency(p.pagoMonto ?? p.total)} desde tu Mercado Pago (Actividad → el pago → Devolver).`
                : `¿Cancelar el pedido N° ${p.numero}?`;
              if (window.confirm(aviso)) onCambiar("cancelado");
            }}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
