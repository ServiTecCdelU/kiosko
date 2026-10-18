"use client";

// components/tienda/catalogo-tienda.tsx — catalogo publico y carrito de la tienda
// online (plan Tienda, etapa 1). El pedido se arma aca y se manda por WhatsApp al
// comercio (lib/tienda.ts). Precios con la oferta del dia, mismo calculo que la caja.
import { useEffect, useMemo, useState } from "react";
import { Bike, CreditCard, Flame, Loader2, Minus, Plus, Search, ShoppingBag, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { apiUrl } from "@/lib/utils/api-url";
import { precioFinal, precioLinea, tieneOferta, type ConOferta } from "@/lib/pricing";
import { etiquetaOfertaConUnidad } from "@/lib/oferta-analisis";
import { esFraccionable } from "@/lib/unidades";
import { mensajePedido, pasoCantidad, totalPedido, urlWhatsapp, type DatosPedido, type ItemPedido } from "@/lib/tienda";

interface ProductoTienda extends ConOferta {
  id: string;
  name: string;
  unidad: string;
  category: string;
  imageUrl: string | null;
  hayStock: boolean;
}

interface DatosTienda {
  abierta: boolean;
  nombre: string;
  mensaje?: string;
  whatsapp?: string;
  retiro?: boolean;
  envio?: boolean;
  /** Cobra online con Mercado Pago (cuenta del comercio conectada). */
  pagoOnline?: boolean;
  productos?: ProductoTienda[];
}

type Carrito = Record<string, number>;

const cantidadTexto = (q: number, unidad: string) =>
  unidad === "un" ? String(q) : `${String(q).replace(".", ",")} ${unidad}`;

/** Precio por unidad/kg de la linea (con combos, el promedio que sale de precioLinea). */
function precioUnitario(p: ProductoTienda, q: number): number {
  return q > 0 ? precioLinea(p, q) / q : precioFinal(p);
}

export function CatalogoTienda({ slug }: { slug: string }) {
  const [datos, setDatos] = useState<DatosTienda | null>(null);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [carrito, setCarrito] = useState<Carrito>({});
  const [verPedido, setVerPedido] = useState(false);
  // Vuelta de Mercado Pago: /tienda/<slug>?pedido=N&pago=aprobado|pendiente|fallido
  const [vueltaPago, setVueltaPago] = useState<{ numero: string; estado: string } | null>(null);
  const claveCarrito = `tienda-carrito:${slug}`;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const numero = q.get("pedido");
    const estado = q.get("pago");
    if (numero && estado) {
      setVueltaPago({ numero, estado });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetch(apiUrl(`/api/publico/tienda?slug=${encodeURIComponent(slug)}`))
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setDatos(await r.json());
      })
      .catch(() => setError(true));
    // El carrito del cliente queda en su navegador por si cierra la pagina.
    try {
      const guardado = localStorage.getItem(claveCarrito);
      if (guardado) setCarrito(JSON.parse(guardado));
    } catch { /* sin localStorage: carrito solo en memoria */ }
  }, [slug, claveCarrito]);

  useEffect(() => {
    try {
      localStorage.setItem(claveCarrito, JSON.stringify(carrito));
    } catch { /* sin localStorage */ }
  }, [carrito, claveCarrito]);

  const productos = datos?.productos ?? [];
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const rubros = useMemo(() => [...new Set(productos.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "es")), [productos]);
  const conOferta = useMemo(() => productos.filter((p) => p.hayStock && tieneOferta(p)), [productos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) =>
      (!rubro || p.category === rubro) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [productos, busqueda, rubro]);

  // Agrupado por rubro (sin busqueda ni filtro): se recorre como una gondola.
  const porRubro = useMemo(() => {
    const grupos = new Map<string, ProductoTienda[]>();
    for (const p of visibles) grupos.set(p.category, [...(grupos.get(p.category) ?? []), p]);
    return [...grupos].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [visibles]);
  const agrupar = !busqueda.trim() && !rubro && porRubro.length > 1;
  const enCarritoCount = Object.keys(carrito).filter((id) => porId.has(id)).length;

  const items: (ItemPedido & { id: string })[] = Object.entries(carrito)
    .filter(([id, q]) => q > 0 && porId.has(id))
    .map(([id, q]) => {
      const p = porId.get(id)!;
      return { id, nombre: p.name, cantidad: q, unidad: p.unidad, precio: precioUnitario(p, q) };
    });
  const total = totalPedido(items);

  const cambiar = (p: ProductoTienda, delta: number) => {
    setCarrito((c) => {
      const paso = pasoCantidad(p.unidad);
      const actual = c[p.id] ?? 0;
      // Por kg arranca en 1/2 kg, despues de a 250 g.
      const siguiente = actual === 0 && delta > 0 && paso < 1 ? 0.5 : Math.round((actual + delta * paso) * 1000) / 1000;
      const nuevo = { ...c };
      if (siguiente <= 0) delete nuevo[p.id];
      else nuevo[p.id] = siguiente;
      return nuevo;
    });
  };

  if (error) {
    return <Mensaje titulo="No encontramos esta tienda" texto="Revisá el link o pedile uno nuevo al comercio." />;
  }
  if (!datos) {
    return (
      <div className="bg-mesh flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!datos.abierta) {
    return <Mensaje titulo={datos.nombre} texto="La tienda online está cerrada por ahora. Volvé a intentar más tarde." />;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {vueltaPago && <AvisoPago {...vueltaPago} comercio={datos.nombre} onCerrar={() => setVueltaPago(null)} />}

      {/* Portada: teal noche con el brillo de la marca */}
      <header className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="bg-mesh pointer-events-none absolute inset-0 opacity-90" />
        <div className="relative mx-auto max-w-5xl px-4 pb-6 pt-8">
          <div className="flex items-center gap-4">
            <span className="grad-money shadow-money flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-2xl font-bold text-[var(--money-foreground)]">
              {iniciales(datos.nombre)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-bold leading-tight sm:text-3xl">{datos.nombre}</h1>
              <p className="text-sm text-sidebar-foreground/70">Elegí tus productos y hacé tu pedido online</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
            {datos.retiro && <Pastilla><Store className="h-3.5 w-3.5" /> Retiro en el local</Pastilla>}
            {datos.envio && <Pastilla><Bike className="h-3.5 w-3.5" /> Envío a domicilio</Pastilla>}
            {datos.pagoOnline && <Pastilla><CreditCard className="h-3.5 w-3.5" /> Pagás online con Mercado Pago</Pastilla>}
          </div>
          {datos.mensaje && (
            <p className="mt-4 rounded-2xl border border-[var(--money)]/30 bg-[var(--money)]/10 px-4 py-2.5 text-sm text-sidebar-foreground">
              {datos.mensaje}
            </p>
          )}
        </div>
      </header>

      {/* Buscador y rubros: quedan a mano al bajar */}
      <div className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-5xl space-y-2.5 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar entre ${productos.length} productos`}
              className="h-11 rounded-2xl bg-card pl-10 shadow-sm"
              aria-label="Buscar productos"
            />
          </div>
          {rubros.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              <Chip activo={!rubro} onClick={() => setRubro(null)}>Todo</Chip>
              {rubros.map((r) => <Chip key={r} activo={rubro === r} onClick={() => setRubro(r === rubro ? null : r)}>{r}</Chip>)}
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-7 px-4 py-5">
        {!busqueda && !rubro && conOferta.length > 0 && (
          <section>
            <Titulo icono={<Flame className="h-4 w-4 text-red-500" />} cantidad={conOferta.length}>Ofertas de hoy</Titulo>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {conOferta.map((p) => (
                <div key={p.id} className="w-40 shrink-0 snap-start sm:w-48">
                  <Tarjeta p={p} cantidad={carrito[p.id] ?? 0} onCambiar={cambiar} destacada />
                </div>
              ))}
            </div>
          </section>
        )}

        {visibles.length === 0 ? (
          <div className="py-14 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No encontramos productos con “{busqueda}”.</p>
          </div>
        ) : agrupar ? (
          porRubro.map(([nombre, lista]) => (
            <section key={nombre}>
              <Titulo cantidad={lista.length}>{nombre}</Titulo>
              <Grilla productos={lista} carrito={carrito} onCambiar={cambiar} />
            </section>
          ))
        ) : (
          <section>
            <Grilla productos={visibles} carrito={carrito} onCambiar={cambiar} />
          </section>
        )}

        <p className="pt-4 text-center text-xs text-muted-foreground">
          Precios con las ofertas de hoy · Tienda online hecha con <span className="font-semibold text-foreground">ServiTec</span>
        </p>
      </main>

      {items.length > 0 && !verPedido && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-4">
          <button
            onClick={() => setVerPedido(true)}
            className="grad-brand shadow-brand mx-auto flex h-14 w-full max-w-md items-center gap-3 rounded-2xl px-4 text-left text-white transition-transform active:scale-[0.98]"
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--money)] px-1 text-[11px] font-bold text-[var(--money-foreground)]">
                {enCarritoCount}
              </span>
            </span>
            <span className="flex-1 font-semibold">Ver mi pedido</span>
            <span className="cifra text-lg font-bold">{formatCurrency(total)}</span>
          </button>
        </div>
      )}

      {verPedido && (
        <PanelPedido
          slug={slug}
          datos={datos}
          items={items}
          total={total}
          porId={porId}
          onCambiar={cambiar}
          onCerrar={() => setVerPedido(false)}
          onEnviado={() => setCarrito({})}
        />
      )}
    </div>
  );
}

/** "Verdulería Don Tito" -> "VD" (sin "de", "la", "el"...). */
function iniciales(nombre: string): string {
  const palabras = nombre
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p && !/^(de|del|la|el|los|las|y)$/i.test(p));
  return ((palabras[0]?.[0] ?? "") + (palabras[1]?.[0] ?? "")).toUpperCase() || "T";
}

/** Tono estable por producto (colores de la marca) para los que no tienen foto. */
const TONOS = [225, 152, 192, 60, 25, 300];
function tonoDe(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
}

function Pastilla({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sidebar-foreground/90 ring-1 ring-white/15">
      {children}
    </span>
  );
}

function Titulo({ children, cantidad, icono }: { children: React.ReactNode; cantidad?: number; icono?: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
      {icono}
      {children}
      {cantidad !== undefined && <span className="text-sm font-medium text-muted-foreground">{cantidad}</span>}
    </h2>
  );
}

function AvisoPago({ numero, estado, comercio, onCerrar }: { numero: string; estado: string; comercio: string; onCerrar: () => void }) {
  const [icono, titulo, texto] = estado === "aprobado"
    ? ["✅", `¡Pago recibido! Pedido N° ${numero}`, `${comercio} ya tiene tu pedido pagado. Te avisan por WhatsApp cuando esté listo.`]
    : estado === "pendiente"
      ? ["⏳", `Pedido N° ${numero}: pago en proceso`, "Mercado Pago está confirmando el pago. El comercio ya tiene tu pedido."]
      : ["⚠️", `Pedido N° ${numero}: el pago no se completó`, `Tu pedido quedó igual en ${comercio}: podés pagarlo al retirar o recibir.`];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
      <div className="w-full max-w-lg space-y-3 rounded-t-3xl bg-card p-6 text-center shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-4xl">{icono}</p>
        <h2 className="text-xl font-bold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{texto}</p>
        <Button className="grad-brand h-11 w-full rounded-2xl text-white" onClick={onCerrar}>Listo</Button>
      </div>
    </div>
  );
}

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="bg-mesh flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="card-premium max-w-sm space-y-2 rounded-3xl p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Store className="h-6 w-6" /></span>
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
        activo ? "border-transparent bg-sidebar text-sidebar-foreground shadow-sm" : "bg-card hover:border-primary/40 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Grilla({ productos, carrito, onCambiar }: { productos: ProductoTienda[]; carrito: Carrito; onCambiar: (p: ProductoTienda, d: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {productos.map((p) => <Tarjeta key={p.id} p={p} cantidad={carrito[p.id] ?? 0} onCambiar={onCambiar} />)}
    </div>
  );
}

function Tarjeta({ p, cantidad, onCambiar, destacada }: {
  p: ProductoTienda;
  cantidad: number;
  onCambiar: (p: ProductoTienda, d: number) => void;
  destacada?: boolean;
}) {
  const oferta = etiquetaOfertaConUnidad(p);
  const rebajado = tieneOferta(p) && p.ofertaTipo !== "combo";
  const tono = tonoDe(p.name);
  const enCarrito = cantidad > 0;
  return (
    <div
      className={cn(
        "card-premium group relative flex h-full flex-col overflow-hidden rounded-2xl",
        destacada && "ring-1 ring-red-500/25",
        enCarrito && "ring-2 ring-[var(--money)]",
        !p.hayStock && "opacity-55",
      )}
    >
      <div
        className={cn("relative flex items-center justify-center overflow-hidden", p.imageUrl ? "aspect-square bg-muted/40" : "h-24")}
        style={p.imageUrl ? undefined : { background: `linear-gradient(135deg, oklch(0.93 0.05 ${tono}), oklch(0.85 0.09 ${tono}))` }}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span className="font-display text-3xl font-bold" style={{ color: `oklch(0.42 0.12 ${tono})` }}>{iniciales(p.name)}</span>
        )}
        {oferta && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">{oferta}</span>
        )}
        {!p.hayStock && (
          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[11px] font-semibold text-white">Sin stock</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 min-h-[2.5em] text-sm font-medium leading-tight">{p.name}</p>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            {rebajado && <p className="text-xs text-muted-foreground line-through">{formatCurrency(p.price)}</p>}
            <p className={cn("cifra text-lg font-bold leading-none", rebajado && "text-red-600")}>
              {formatCurrency(precioFinal(p))}
              {esFraccionable(p.unidad) && <span className="font-sans text-xs font-medium text-muted-foreground"> /{p.unidad}</span>}
            </p>
          </div>
          {p.hayStock && !enCarrito && (
            <button
              onClick={() => onCambiar(p, 1)}
              aria-label={`Agregar ${p.name}`}
              className="grad-money shadow-money flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--money-foreground)] transition-transform hover:scale-105 active:scale-95"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          )}
        </div>
        {enCarrito && (
          <div className="flex items-center justify-between rounded-xl bg-[var(--money)]/15">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--money)]/20" onClick={() => onCambiar(p, -1)} aria-label={`Quitar ${p.name}`}>
              <Minus className="h-4 w-4" />
            </button>
            <span className="cifra text-sm font-bold">{cantidadTexto(cantidad, p.unidad)}</span>
            <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--money)]/20" onClick={() => onCambiar(p, 1)} aria-label={`Sumar ${p.name}`}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelPedido({ slug, datos, items, total, porId, onCambiar, onCerrar, onEnviado }: {
  slug: string;
  datos: DatosTienda;
  items: (ItemPedido & { id: string })[];
  total: number;
  porId: Map<string, ProductoTienda>;
  onCambiar: (p: ProductoTienda, d: number) => void;
  onCerrar: () => void;
  onEnviado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ numero: number; texto: string; sinPagoOnline?: boolean } | null>(null);
  const [entrega, setEntrega] = useState<DatosPedido["entrega"]>(datos.retiro ? "retiro" : "envio");
  const [direccion, setDireccion] = useState("");
  const [pago, setPago] = useState<DatosPedido["pago"]>("efectivo");
  const [nota, setNota] = useState("");
  const [faltan, setFaltan] = useState(false);
  const hayPesables = items.some((i) => i.unidad !== "un");

  // El pedido queda guardado en el sistema del comercio (le suena en Pedidos). El
  // WhatsApp queda como aviso opcional, con el numero de pedido.
  const enviar = async () => {
    if (!nombre.trim() || !telefono.trim() || (entrega === "envio" && !direccion.trim())) {
      setFaltan(true);
      return;
    }
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch(apiUrl("/api/publico/tienda/pedido"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          items: items.map((i) => ({ productId: i.id, cantidad: i.cantidad })),
          datos: { nombre, telefono, entrega, direccion, pago, nota },
        }),
      });
      const r = await res.json().catch(() => null);
      if (!res.ok) throw new Error(r?.error ?? "No se pudo mandar el pedido");
      // Pago online: el pedido ya quedo guardado; se va a Mercado Pago a pagarlo.
      if (r.pagoUrl) {
        onEnviado();
        window.location.href = r.pagoUrl;
        return;
      }
      const confirmados: ItemPedido[] = r.items.map((i: { name: string; quantity: number; unidad: string; price: number }) => (
        { nombre: i.name, cantidad: i.quantity, unidad: i.unidad, precio: i.price }
      ));
      setConfirmado({
        numero: r.numero,
        texto: mensajePedido(datos.nombre, confirmados, { nombre, entrega, direccion, pago, nota }, r.numero),
        sinPagoOnline: pago === "mercadopago" && !!datos.pagoOnline,
      });
      onEnviado();
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : "No se pudo mandar el pedido");
    } finally {
      setEnviando(false);
    }
  };

  if (confirmado) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
        <div className="w-full max-w-lg space-y-3 rounded-t-3xl bg-card p-6 text-center shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-4xl">✅</p>
          <h2 className="text-xl font-bold">¡Pedido N° {confirmado.numero} enviado!</h2>
          <p className="text-sm text-muted-foreground">
            {datos.nombre} ya lo recibió. Te van a escribir al {telefono} cuando esté {entrega === "envio" ? "en camino" : "listo para retirar"}.
          </p>
          {confirmado.sinPagoOnline && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800">No pudimos abrir el pago online: lo pagás con Mercado Pago al retirar o recibir.</p>
          )}
          <Button asChild variant="outline" className="h-11 w-full rounded-2xl">
            <a href={urlWhatsapp(datos.whatsapp!, confirmado.texto)} target="_blank" rel="noopener noreferrer">Avisarles también por WhatsApp</a>
          </Button>
          <Button className="grad-brand h-11 w-full rounded-2xl text-white" onClick={onCerrar}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ShoppingBag className="h-5 w-5 text-primary" /> Tu pedido</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <ul className="divide-y">
          {items.map((i) => {
            const p = porId.get(i.id)!;
            return (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
                  style={{ background: `oklch(0.92 0.06 ${tonoDe(i.nombre)})`, color: `oklch(0.42 0.12 ${tonoDe(i.nombre)})` }}
                >
                  {iniciales(i.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.nombre}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(i.cantidad * i.precio)}</p>
                </div>
                <div className="flex items-center rounded-xl border">
                  <button className="flex h-8 w-8 items-center justify-center" onClick={() => onCambiar(p, -1)} aria-label={`Quitar ${i.nombre}`}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="min-w-12 text-center text-sm font-semibold">{cantidadTexto(i.cantidad, i.unidad)}</span>
                  <button className="flex h-8 w-8 items-center justify-center" onClick={() => onCambiar(p, 1)} aria-label={`Sumar ${i.nombre}`}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-baseline justify-between rounded-2xl bg-muted/60 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Total{hayPesables ? " aproximado" : ""}</span>
          <span className="cifra-hero text-3xl">{formatCurrency(total)}</span>
        </div>
        {hayPesables && <p className="mt-1 text-xs text-muted-foreground">Lo que va por kg se ajusta cuando lo pesan.</p>}

        <div className="mt-4 space-y-3">
          <Campo etiqueta="Tu nombre" falta={faltan && !nombre.trim()}>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11 rounded-xl" autoComplete="name" />
          </Campo>
          <Campo etiqueta="Tu celular (para avisarte)" falta={faltan && !telefono.trim()}>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="343 456-7890" inputMode="tel" className="h-11 rounded-xl" autoComplete="tel" />
          </Campo>
          {datos.retiro && datos.envio && (
            <div className="grid grid-cols-2 gap-2">
              <Opcion activa={entrega === "retiro"} onClick={() => setEntrega("retiro")}>Retiro en el local</Opcion>
              <Opcion activa={entrega === "envio"} onClick={() => setEntrega("envio")}>Envío a domicilio</Opcion>
            </div>
          )}
          {entrega === "envio" && (
            <Campo etiqueta="Dirección de entrega" falta={faltan && !direccion.trim()}>
              <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="h-11 rounded-xl" autoComplete="street-address" />
            </Campo>
          )}
          <Campo etiqueta="¿Cómo pagás?">
            <div className="grid grid-cols-3 gap-2">
              <Opcion activa={pago === "efectivo"} onClick={() => setPago("efectivo")}>Efectivo</Opcion>
              <Opcion activa={pago === "transferencia"} onClick={() => setPago("transferencia")}>Transferencia</Opcion>
              <Opcion activa={pago === "mercadopago"} onClick={() => setPago("mercadopago")}>{datos.pagoOnline ? "Pagar ahora con Mercado Pago" : "Mercado Pago"}</Opcion>
            </div>
          </Campo>
          <Campo etiqueta="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: tomates no muy maduros" className="h-11 rounded-xl" />
          </Campo>
        </div>

        {errorEnvio && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{errorEnvio}</p>}
        <Button className="grad-brand shadow-brand mt-5 h-12 w-full rounded-2xl text-base font-semibold text-white hover:opacity-95" disabled={enviando} onClick={() => void enviar()}>
          {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {pago === "mercadopago" && datos.pagoOnline ? "Enviar y pagar" : "Enviar pedido"}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">El comercio lo recibe al instante y te avisa por WhatsApp.</p>
      </div>
    </div>
  );
}

function Campo({ etiqueta, falta, children }: { etiqueta: string; falta?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={cn("text-xs font-medium", falta ? "text-red-600" : "text-muted-foreground")}>
        {etiqueta}{falta && " (falta)"}
      </span>
      {children}
    </label>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-2 py-2.5 text-xs font-medium leading-tight transition-all",
        activa ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "hover:border-primary/40 hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}
