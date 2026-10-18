"use client";

// components/tienda/catalogo-tienda.tsx — catalogo publico y carrito de la tienda
// online (plan Tienda, etapa 1). El pedido se arma aca y se manda por WhatsApp al
// comercio (lib/tienda.ts). Precios con la oferta del dia, mismo calculo que la caja.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Package, Plus, Search, ShoppingBag, Store, X } from "lucide-react";
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
  const claveCarrito = `tienda-carrito:${slug}`;

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!datos.abierta) {
    return <Mensaje titulo={datos.nombre} texto="La tienda online está cerrada por ahora. Volvé a intentar más tarde." />;
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold leading-tight">{datos.nombre}</h1>
              <p className="text-sm text-muted-foreground">Elegí tus productos y mandanos el pedido por WhatsApp</p>
            </div>
          </div>
          {datos.mensaje && <p className="mt-3 rounded-2xl bg-muted px-4 py-2 text-sm">{datos.mensaje}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar productos"
            className="h-11 rounded-2xl pl-10"
            aria-label="Buscar productos"
          />
        </div>

        {rubros.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip activo={!rubro} onClick={() => setRubro(null)}>Todo</Chip>
            {rubros.map((r) => <Chip key={r} activo={rubro === r} onClick={() => setRubro(r === rubro ? null : r)}>{r}</Chip>)}
          </div>
        )}

        {!busqueda && !rubro && conOferta.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Ofertas de hoy</h2>
            <Grilla productos={conOferta} carrito={carrito} onCambiar={cambiar} />
          </section>
        )}

        <section>
          {!busqueda && !rubro && conOferta.length > 0 && <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Todos los productos</h2>}
          {visibles.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay productos con ese nombre.</p>
          ) : (
            <Grilla productos={visibles} carrito={carrito} onCambiar={cambiar} />
          )}
        </section>
      </main>

      {items.length > 0 && !verPedido && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <Button className="h-12 w-full rounded-2xl text-base" onClick={() => setVerPedido(true)}>
              <ShoppingBag className="mr-2 h-5 w-5" /> Ver pedido ({items.length}) · {formatCurrency(total)}
            </Button>
          </div>
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

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="space-y-2">
        <Store className="mx-auto h-8 w-8 text-muted-foreground" />
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
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        activo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
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

function Tarjeta({ p, cantidad, onCambiar }: { p: ProductoTienda; cantidad: number; onCambiar: (p: ProductoTienda, d: number) => void }) {
  const oferta = etiquetaOfertaConUnidad(p);
  const rebajado = tieneOferta(p) && p.ofertaTipo !== "combo";
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card", !p.hayStock && "opacity-60")}>
      {/* Sin foto, un recuadro bajo: la mayoria de los catalogos arranca sin imagenes. */}
      <div className={cn("relative flex items-center justify-center bg-muted/50", p.imageUrl ? "aspect-square" : "h-20")}>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-7 w-7 text-muted-foreground/30" />
        )}
        {oferta && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{oferta}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
        <div className="mt-auto">
          {rebajado && <p className="text-xs text-muted-foreground line-through">{formatCurrency(p.price)}</p>}
          <p className="text-lg font-bold leading-tight">
            {formatCurrency(precioFinal(p))}
            {esFraccionable(p.unidad) && <span className="text-xs font-medium text-muted-foreground"> /{p.unidad}</span>}
          </p>
        </div>
        {!p.hayStock ? (
          <p className="mt-1 text-center text-xs font-medium text-muted-foreground">Sin stock</p>
        ) : cantidad === 0 ? (
          <Button size="sm" className="mt-1 h-9 rounded-xl" onClick={() => onCambiar(p, 1)}>
            <Plus className="mr-1 h-4 w-4" /> Agregar
          </Button>
        ) : (
          <div className="mt-1 flex items-center justify-between rounded-xl border">
            <button className="flex h-9 w-9 items-center justify-center" onClick={() => onCambiar(p, -1)} aria-label={`Quitar ${p.name}`}>
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{cantidadTexto(cantidad, p.unidad)}</span>
            <button className="flex h-9 w-9 items-center justify-center" onClick={() => onCambiar(p, 1)} aria-label={`Sumar ${p.name}`}>
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
  const [confirmado, setConfirmado] = useState<{ numero: number; texto: string } | null>(null);
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
      const confirmados: ItemPedido[] = r.items.map((i: { name: string; quantity: number; unidad: string; price: number }) => (
        { nombre: i.name, cantidad: i.quantity, unidad: i.unidad, precio: i.price }
      ));
      setConfirmado({ numero: r.numero, texto: mensajePedido(datos.nombre, confirmados, { nombre, entrega, direccion, pago, nota }, r.numero) });
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
        <div className="w-full max-w-lg space-y-3 rounded-t-2xl bg-card p-6 text-center sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-4xl">✅</p>
          <h2 className="text-xl font-bold">¡Pedido N° {confirmado.numero} enviado!</h2>
          <p className="text-sm text-muted-foreground">
            {datos.nombre} ya lo recibió. Te van a escribir al {telefono} cuando esté {entrega === "envio" ? "en camino" : "listo para retirar"}.
          </p>
          <Button asChild variant="outline" className="h-11 w-full rounded-2xl">
            <a href={urlWhatsapp(datos.whatsapp!, confirmado.texto)} target="_blank" rel="noopener noreferrer">Avisarles también por WhatsApp</a>
          </Button>
          <Button className="h-11 w-full rounded-2xl" onClick={onCerrar}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Tu pedido</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <ul className="divide-y">
          {items.map((i) => {
            const p = porId.get(i.id)!;
            return (
              <li key={i.id} className="flex items-center gap-3 py-2">
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
        <div className="mt-2 flex items-baseline justify-between border-t pt-3">
          <span className="text-sm text-muted-foreground">Total{hayPesables ? " aproximado" : ""}</span>
          <span className="text-xl font-bold">{formatCurrency(total)}</span>
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
              <Opcion activa={pago === "mercadopago"} onClick={() => setPago("mercadopago")}>Mercado Pago</Opcion>
            </div>
          </Campo>
          <Campo etiqueta="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: tomates no muy maduros" className="h-11 rounded-xl" />
          </Campo>
        </div>

        {errorEnvio && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{errorEnvio}</p>}
        <Button className="mt-5 h-12 w-full rounded-2xl text-base" disabled={enviando} onClick={() => void enviar()}>
          {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar pedido
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
        "rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors",
        activa ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
