"use client";
import { apiUrl } from "@/lib/utils/api-url"

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, ArrowLeft, ScanLine, Printer, PauseCircle, WifiOff, RefreshCw, Camera, MonitorSmartphone, Settings2, Wallet, CircleDollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal, precioLinea, tieneOferta, comboLabel, pesos } from "@/lib/pricing";
import { ahorroLinea, analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import { usePantallaCliente } from "@/hooks/use-pantalla-cliente";
import { useOfertasVigentes } from "@/hooks/use-ofertas-vigentes";
import { useCart } from "@/hooks/useCart";
import { searchProducts, findProductByCode, getFavoritos, createProduct } from "@/services/products-service";
import { ImporteLibreDialog } from "@/components/pos/importe-libre-dialog";
import { PresupuestoDialog } from "@/components/pos/presupuesto-dialog";
import { carritoDePresupuesto, obtenerPresupuesto } from "@/services/presupuestos-service";
import { carritoDePedido, obtenerPedido } from "@/services/pedidos-service";
import { estaVigente } from "@/lib/presupuesto";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";

import { createSale, NetworkUnavailableError, type CreateSaleInput } from "@/services/sales-service";
import { getCajasAbiertas } from "@/services/caja-service";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { parseCodigoBalanza, parseTicketBalanza, pesoDesdeImporte, unidadesDesdeImporte } from "@/lib/barcode-balanza";
import { leerDigitosPlu, leerFormatoBalanza, leerPrefijoTicket } from "@/lib/balanza-config";
import { ajustarCantidad, cantidadTexto, separarMultiplicador } from "@/lib/cantidad";
import { esFraccionable, porUnidad } from "@/lib/unidades";
import { buscarProductosOffline, buscarPorCodigoOffline, getFavoritosOffline } from "@/lib/offline/catalog";
import { encolarVentaPendiente, descontarStockOffline } from "@/lib/offline/db";
import { guardarCajasConocidas, leerCajasConocidas } from "@/lib/offline/caja-local";
import { VentasOfflineDialog } from "@/components/pos/ventas-offline-dialog";
import { getCurrentUser, useAuth } from "@/hooks/use-auth";
import { moduloActivo } from "@/lib/modulos";
import { MENSAJE_MP_PRO, planIncluyeMercadoPago } from "@/lib/suscripcion";
import { panelHref } from "@/lib/panel";
import { CartPanel, type ConfirmData, type CartPanelHandle } from "@/components/pos/cart-panel";
import { PesoDialog } from "@/components/pos/peso-dialog";
import { TicketPrint, type TicketData } from "@/components/pos/ticket-print";
import { FacturaPos } from "@/components/facturacion/factura-pos";
import { TicketsEsperaDialog } from "@/components/pos/tickets-espera-dialog";
import { OfertasRapidas } from "@/components/pos/ofertas-rapidas";
import { AvisoSoporte } from "@/components/layout/aviso-soporte";
import { useNombreComercio } from "@/components/stock/oferta-publicada";
import {
  listarTicketsEnEspera, suspenderTicket, quitarTicketEnEspera, type TicketEnEspera,
} from "@/lib/utils/tickets-espera";
import { AuthGuard } from "@/components/auth/auth-guard";
import {
  crearCobroQR, cobrarConPoint, listarDispositivosMP, getDispositivoGuardado, guardarDispositivo,
  type CobroQR, type CobroPoint,
} from "@/services/mercadopago-service";
import { getVentaById } from "@/services/sales-service";
import { MercadoPagoQrDialog } from "@/components/pos/mercadopago-qr-dialog";
import { MercadoPagoPointDialog } from "@/components/pos/mercadopago-point-dialog";
import { BarcodeScannerDialog } from "@/components/pos/barcode-scanner-dialog";
import { QuickCreateProductDialog } from "@/components/pos/quick-create-product-dialog";
import { ImpresoraDialog } from "@/components/pos/impresora-dialog";
import { abrirCajon, imprimirTicket as imprimirTicketConfigurado } from "@/lib/impresora/imprimir";
import { guardarConfigImpresora, impresoraConfigurada, leerConfigImpresora, modoPuedeAbrirCajon, type ConfigImpresora } from "@/lib/impresora/config";
import type { Caja, Product } from "@/lib/types";

/** Ofertas que se imprimen al pie de cada ticket. */
const OFERTAS_EN_TICKET = 3;

/** Codigo del producto "Varios" a precio libre que crea el boton del POS. */
const CODIGO_VARIOS = "VARIOS";

export default function PosPage() {
  return (
    <AuthGuard>
      <PosScreen />
    </AuthGuard>
  );
}

function PosScreen() {
  // Modulos del comercio (lib/modulos.ts): presupuestos y balanza segun rubro y "Mi comercio".
  const { user: sesion } = useAuth();
  const conPresupuestos = moduloActivo("presupuestos", sesion?.rubro, sesion?.modulos);
  const conBalanza = moduloActivo("balanza", sesion?.rubro, sesion?.modulos);
  const cart = useCart();
  const anunciarVenta = usePantallaCliente(cart.items);
  const ofertasVigentes = useOfertasVigentes();
  const [nombreComercio] = useNombreComercio();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cajaId, setCajaId] = useState<string | undefined>(undefined);
  const [cajasAbiertas, setCajasAbiertas] = useState<Caja[]>([]);
  // Hasta saber que cajas hay abiertas no se avisa "caja cerrada".
  const [cajasCargadas, setCajasCargadas] = useState(false);
  const [favoritos, setFavoritos] = useState<Product[]>([]);
  const [pesoProduct, setPesoProduct] = useState<Product | null>(null);
  const [importeLibreProduct, setImporteLibreProduct] = useState<Product | null>(null);
  const [presupuestoOpen, setPresupuestoOpen] = useState(false);
  /** Presupuesto que se esta cobrando (Presupuestos -> "Pasar a venta"). */
  const [presupuestoActivo, setPresupuestoActivo] = useState<{ id: string; numero: number; vence: string; vigente: boolean } | null>(null);
  // Pedido de la tienda online que se esta cobrando (/pos?pedido=<id>, 73_pedidos_tienda.sql).
  const [pedidoActivo, setPedidoActivo] = useState<{ id: string; numero: number; cliente: string } | null>(null);
  const [lastTicket, setLastTicket] = useState<TicketData | null>(null);
  // Id de la ultima venta registrada (para facturarla). null si quedo offline.
  const [ultimaVentaId, setUltimaVentaId] = useState<string | null>(null);
  const [ticketsEspera, setTicketsEspera] = useState<TicketEnEspera[]>([]);
  const [esperaOpen, setEsperaOpen] = useState(false);
  const [cobroQR, setCobroQR] = useState<CobroQR | null>(null);
  const [cobroPoint, setCobroPoint] = useState<CobroPoint | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [codigoNoEncontrado, setCodigoNoEncontrado] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<CartPanelHandle>(null);
  const { isOnline, pendientes, pendingCount, conError, refreshPendingCount, syncVentasPendientes } = useOfflineSync();
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [impresoraOpen, setImpresoraOpen] = useState(false);
  // Configuracion de impresion de esta PC (localStorage): se lee al montar para no
  // desfasar el render del servidor.
  const [configImpresora, setConfigImpresora] = useState<ConfigImpresora | null>(null);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    focusInput();
    // Multi-caja: el cajero vende en SU caja (la que abrio el). Encargado/admin
    // sin caja propia: si hay una sola abierta se usa esa; con varias, elige.
    const elegirCaja = (cs: Caja[]) => {
      setCajasAbiertas(cs);
      setCajasCargadas(true);
      const u = getCurrentUser();
      const propia = u ? cs.find((c) => c.abiertaPor === u.id) : undefined;
      if (propia) setCajaId(propia.id);
      else if (u?.rol !== "cajero" && cs.length === 1) setCajaId(cs[0].id);
      else setCajaId(undefined);
    };
    getCajasAbiertas()
      .then((cs) => {
        guardarCajasConocidas(cs);
        elegirCaja(cs);
      })
      // Sin internet: la ultima lista conocida, para que las ventas offline
      // sigan imputandose a la caja (si no, quedaban fuera del arqueo).
      .catch(() => elegirCaja(leerCajasConocidas()));
    (isOnline ? getFavoritos() : getFavoritosOffline())
      .then(setFavoritos)
      .catch(() => getFavoritosOffline().then(setFavoritos));
    setTicketsEspera(listarTicketsEnEspera());
    setConfigImpresora(leerConfigImpresora());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusInput]);

  const handleSuspender = useCallback(() => {
    if (cart.items.length === 0) return;
    const nota = window.prompt("Nota para identificar este carrito (opcional):", "") ?? "";
    suspenderTicket(cart.items, nota.trim());
    setTicketsEspera(listarTicketsEnEspera());
    cart.clear();
    toast.success("Venta suspendida");
    focusInput();
  }, [cart, focusInput]);

  const handleRecuperar = useCallback(
    (ticket: TicketEnEspera) => {
      if (cart.items.length > 0) {
        toast.error("Vaciá o cobrá el carrito actual antes de recuperar otro");
        return;
      }
      cart.replaceAll(ticket.items);
      quitarTicketEnEspera(ticket.id);
      setTicketsEspera(listarTicketsEnEspera());
      setEsperaOpen(false);
      focusInput();
    },
    [cart, focusInput],
  );

  const handleDescartarEspera = useCallback((id: string) => {
    quitarTicketEnEspera(id);
    setTicketsEspera(listarTicketsEnEspera());
  }, []);

  // Atajos de teclado para mostrador: F2 cobrar · F3 buscar · Esc limpiar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        cartRef.current?.confirm();
      } else if (e.key === "F3") {
        e.preventDefault();
        focusInput();
      } else if (e.key === "Escape") {
        setQuery("");
        setResults([]);
        focusInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusInput]);

  // "150*tornillo": la cantidad va delante del asterisco y se busca lo que sigue.
  const { cantidad: multiplicador, texto: textoBusqueda } = separarMultiplicador(query);

  // Busqueda por nombre con debounce
  useEffect(() => {
    const q = textoBusqueda.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(isOnline ? await searchProducts(q) : await buscarProductosOffline(q));
      } catch {
        setResults(await buscarProductosOffline(q));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [textoBusqueda, isOnline]);

  /** Suma `cantidad` al carrito si alcanza el stock (sin control de stock no hay tope). */
  const agregarCantidad = useCallback(
    (p: Product, cantidad: number): boolean => {
      if (p.stockControlado) {
        const enCarrito = cart.items.find((i) => i.product.id === p.id)?.quantity ?? 0;
        if (enCarrito + cantidad > p.stock + 1e-9) {
          toast.error(`Stock maximo (${cantidadTexto(p.stock, p.unidad)}) para ${p.name}`);
          return false;
        }
      }
      cart.addProduct(p, cantidad);
      return true;
    },
    [cart],
  );

  /**
   * `cantidad` viene del multiplicador del buscador ("150*tornillo"). Sin ella,
   * lo fraccionable (kg, m, l) pide cuanto con el dialogo y lo demas suma 1.
   */
  const addToCart = useCallback(
    (p: Product, cantidad: number | null = null) => {
      if (p.stockControlado && p.stock <= 0) {
        toast.error(`Sin stock: ${p.name}`, {
          description: "Cargá stock en Stock, o marcalo como sin control de stock si no se cuenta (pan, servicios).",
        });
        return;
      }
      // Recargas, fotocopias, "varios": se pide el importe (el multiplicador no aplica).
      if (p.precioLibre) {
        setImporteLibreProduct(p);
        return;
      }
      if (cantidad !== null) {
        if (!esFraccionable(p.unidad) && !Number.isInteger(cantidad)) {
          toast.error(`${p.name} se vende por unidad: la cantidad tiene que ser entera`);
          return;
        }
        if (agregarCantidad(p, ajustarCantidad(cantidad, p.unidad))) {
          toast.success(`${cantidadTexto(ajustarCantidad(cantidad, p.unidad), p.unidad)} × ${p.name}`);
        }
        return;
      }
      if (esFraccionable(p.unidad)) {
        setPesoProduct(p);
        return;
      }
      if (agregarCantidad(p, 1) && p.lote && p.lote > 1) {
        toast.info(`${p.name} viene en paquete de ${p.lote} unidades`);
      }
    },
    [agregarCantidad],
  );

  const confirmarPeso = useCallback(
    (cantidad: number) => {
      if (pesoProduct) agregarCantidad(pesoProduct, cantidad);
    },
    [agregarCantidad, pesoProduct],
  );

  // Pedidos de la tienda -> "Pasar a venta" abre /pos?pedido=<id>: carrito con los
  // productos y el precio de hoy (lo de por kg se pesa aca) y se cobra con pedidoId.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pedido");
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      try {
        const { pedido, productos } = await obtenerPedido(id);
        if (!pedido) {
          toast.error("No se encontró el pedido");
          return;
        }
        if (pedido.estado === "entregado" || pedido.estado === "cancelado") {
          toast.error(`El pedido N° ${pedido.numero} ya está ${pedido.estado}`);
          return;
        }
        if (pedido.pagoEstado === "aprobado") {
          toast.error(`El pedido N° ${pedido.numero} ya está pagado online: entregalo desde Pedidos`);
          return;
        }
        const { items, faltantes } = carritoDePedido(pedido, productos);
        cart.replaceAll(items);
        setPresupuestoActivo(null);
        setPedidoActivo({ id: pedido.id, numero: pedido.numero, cliente: pedido.clienteNombre });
        if (faltantes.length > 0) toast.warning(`Ya no están en el catálogo: ${faltantes.join(", ")}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo abrir el pedido");
      }
    })();
    // Solo al entrar al POS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presupuestos -> "Pasar a venta" abre /pos?presupuesto=<id>: se arma el carrito
  // con los productos de hoy y se cobra con presupuestoId (precios respetados).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("presupuesto");
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      try {
        const { presupuesto, productos } = await obtenerPresupuesto(id);
        if (!presupuesto) {
          toast.error("No se encontró el presupuesto");
          return;
        }
        if (presupuesto.estado !== "vigente") {
          toast.error(`El presupuesto N° ${presupuesto.numero} ya está ${presupuesto.estado}`);
          return;
        }
        const vigente = estaVigente(presupuesto.estado, presupuesto.vence, hoyArgentinaISO());
        const { items, faltantes } = carritoDePresupuesto(presupuesto, productos, vigente);
        cart.replaceAll(items);
        setPresupuestoActivo({ id: presupuesto.id, numero: presupuesto.numero, vence: presupuesto.vence, vigente });
        if (faltantes.length > 0) toast.warning(`Ya no están en el catálogo: ${faltantes.join(", ")}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo abrir el presupuesto");
      }
    })();
    // Solo al entrar al POS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Cantidad tipeada o +/− en el carrito: no deja pasar el stock. */
  const cambiarCantidad = useCallback(
    (productId: string, cantidad: number) => {
      const linea = cart.items.find((i) => i.product.id === productId);
      if (!linea) return;
      const p = linea.product;
      const q = ajustarCantidad(cantidad, p.unidad);
      if (p.stockControlado && q > p.stock + 1e-9) {
        toast.error(`Stock maximo (${cantidadTexto(p.stock, p.unidad)}) para ${p.name}`);
        if (p.stock > 0) cart.setQuantity(productId, p.stock);
        return;
      }
      cart.setQuantity(productId, q);
    },
    [cart],
  );

  const buscarPorCodigo = useCallback(
    (codigo: string): Promise<Product | null> =>
      isOnline
        ? findProductByCode(codigo).catch(() => buscarPorCodigoOffline(codigo))
        : buscarPorCodigoOffline(codigo),
    [isOnline],
  );

  /**
   * "Varios": producto de precio libre con codigo VARIOS. Se crea solo la primera
   * vez (cualquier rol puede dar de alta desde el POS, como el alta rapida).
   */
  const obtenerVarios = useCallback(async (): Promise<Product | null> => {
    let varios = await buscarPorCodigo(CODIGO_VARIOS);
    if (!varios) {
      if (!isOnline) {
        toast.error("Sin conexión no se puede crear “Varios”. Probá cuando vuelva internet.");
        return null;
      }
      await createProduct({
        name: "Varios", price: 0, stock: 0, codigo: CODIGO_VARIOS,
        stockControlado: false, precioLibre: true, revisar: false,
      });
      varios = await buscarPorCodigo(CODIGO_VARIOS);
    }
    if (!varios) throw new Error("No se encontró el producto Varios");
    if (!varios.precioLibre) {
      toast.error("El producto con código VARIOS no tiene precio libre. Activalo en Stock.");
      return null;
    }
    return varios;
  }, [buscarPorCodigo, isOnline]);

  const venderVarios = useCallback(async () => {
    try {
      const varios = await obtenerVarios();
      if (varios) setImporteLibreProduct(varios);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir Varios");
    }
  }, [obtenerVarios]);

  // Etiqueta de balanza (EAN-13 prefijo 20-29): trae el PLU y el peso ya
  // embebidos, asi que el producto pesable se agrega directo sin PesoDialog.
  const procesarCodigoBalanza = useCallback(
    async (codigo: string): Promise<boolean> => {
      const formato = leerFormatoBalanza();
      // Ticket de la balanza con varios productos: solo trae el total (lib/barcode-balanza.ts).
      const ticket = parseTicketBalanza(codigo, leerPrefijoTicket(), formato === "importe-centavos");
      if (ticket) {
        try {
          const varios = await obtenerVarios();
          if (varios) {
            cart.addPrecioLibre(varios, ticket.importe);
            toast.success(`Ticket de la balanza · ${formatCurrency(ticket.importe)}`, {
              description: "Entra como Varios: el ticket trae solo el total, no las verduras.",
            });
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "No se pudo cargar el ticket de la balanza");
        }
        return true;
      }
      const balanza = parseCodigoBalanza(codigo, formato, leerDigitosPlu());
      if (!balanza) return false;
      for (const c of balanza.codigosBusqueda) {
        const p = await buscarPorCodigo(c);
        if (!p) continue;
        if (p.unidad !== "kg") {
          // Producto por unidad (un pack de oferta, 71_productos_pack.sql): la etiqueta
          // trae el importe de las unidades que marco la balanza.
          if (balanza.importe !== null) {
            const n = unidadesDesdeImporte(balanza.importe, precioFinal(p));
            if (n === null) {
              toast.error(`${p.name}: la etiqueta dice ${formatCurrency(balanza.importe)} y el precio es ${formatCurrency(precioFinal(p))}. Volvé a enviar los precios a la balanza.`);
              return true;
            }
            addToCart(p, n);
            return true;
          }
          toast.warning(`${p.name} no está marcado como pesable`);
          addToCart(p);
          return true;
        }
        // Etiqueta con importe: el peso se saca del precio por kg del sistema, con la
        // oferta de hoy (la balanza la recibe por Qendra, lib/qendra.ts). El cobro da
        // siempre el importe de la etiqueta; si la balanza quedo desactualizada, solo
        // se corre el peso que se descuenta del stock.
        const kg = balanza.importe !== null ? pesoDesdeImporte(balanza.importe, precioFinal(p)) : balanza.pesoKg;
        if (!kg) {
          toast.error(`${p.name} no tiene precio por kg cargado`);
          return true;
        }
        const enCarrito = cart.items.find((i) => i.product.id === p.id)?.quantity ?? 0;
        if (p.stockControlado && enCarrito + kg > p.stock + 1e-9) {
          toast.error(`Stock maximo (${p.stock}kg) para ${p.name}`);
          return true;
        }
        cart.addProduct(p, kg);
        toast.success(
          balanza.importe !== null
            ? `${p.name} · ${formatCurrency(balanza.importe)} = ${cantidadTexto(kg, "kg")}`
            : `${p.name} · ${kg.toFixed(3)} kg`,
        );
        return true;
      }
      toast.error(`Etiqueta de balanza sin producto: PLU ${balanza.plu}`);
      return true;
    },
    [buscarPorCodigo, addToCart, cart, obtenerVarios],
  );

  // Enter: el lector de codigo de barras "tipea" + Enter. Match exacto -> agrega directo.
  // Con multiplicador ("12*7790...") el codigo es lo que sigue al asterisco.
  const handleEnter = useCallback(async () => {
    const value = textoBusqueda.trim();
    if (!value) return;
    try {
      if (multiplicador === null && await procesarCodigoBalanza(value)) {
        setQuery("");
        setResults([]);
        focusInput();
        return;
      }
      const found = await buscarPorCodigo(value);
      if (found) {
        addToCart(found, multiplicador);
        setQuery("");
        setResults([]);
        focusInput();
        return;
      }
      if (results.length === 1) {
        addToCart(results[0], multiplicador);
        setQuery("");
        setResults([]);
        focusInput();
      }
    } catch {
      toast.error("Error al buscar");
    }
  }, [textoBusqueda, multiplicador, results, addToCart, focusInput, buscarPorCodigo, procesarCodigoBalanza]);

  const handleScanDetected = useCallback(
    async (codigo: string) => {
      setScannerOpen(false);
      try {
        if (multiplicador === null && await procesarCodigoBalanza(codigo)) return;
        const found = await buscarPorCodigo(codigo);
        if (found) {
          // "150*" tipeado antes de escanear con la camara aplica a lo escaneado.
          addToCart(found, multiplicador);
          if (multiplicador !== null) setQuery("");
          else toast.success(`${found.name} agregado`);
        } else {
          setCodigoNoEncontrado(codigo);
        }
      } catch {
        toast.error("Error al buscar el código");
      }
    },
    [addToCart, buscarPorCodigo, procesarCodigoBalanza, multiplicador],
  );

  const handleProductoCreado = useCallback(
    (p: Product) => {
      addToCart(p);
      toast.success(`${p.name} creado y agregado`);
      focusInput();
    },
    [addToCart, focusInput],
  );

  const imprimirTicket = useCallback((ticket: TicketData, manual = false) => {
    // Segun la configuracion de esta PC: termica ESC/POS (USB o agente), Zebra o
    // navegador. Si la impresora no responde, se cae al ticket HTML del navegador
    // para que el cliente igual se lleve su ticket.
    const porNavegador = () => setTimeout(() => window.print(), 150);
    const config = configImpresora ?? leerConfigImpresora();
    const guardar = (modo: ConfigImpresora["modo"]) => {
      const nueva = { ...config, modo };
      guardarConfigImpresora(nueva);
      setConfigImpresora(nueva);
    };
    // "Reimprimir" sin ticketera: el cliente lo pidio, sale por el navegador.
    if (manual && config.modo === "ninguno") {
      porNavegador();
      return;
    }
    // PC sin configurar: en vez de abrir la ventana de imprimir en cada venta
    // (muchos kioscos no tienen ticketera), se pregunta una vez.
    if (!manual && !impresoraConfigurada()) {
      toast("¿Imprimís tickets en esta caja?", {
        id: "preguntar-impresora",
        duration: 20000,
        description: "Si no tenés ticketera, elegí No: se cobra sin imprimir. Se cambia en “Impresora”.",
        action: { label: "Sí, imprimir", onClick: () => { guardar("navegador"); porNavegador(); } },
        cancel: { label: "No", onClick: () => guardar("ninguno") },
      });
      return;
    }
    imprimirTicketConfigurado(ticket, config)
      .then((r) => {
        if (r === "navegador") porNavegador();
      })
      .catch((e) => {
        toast.error(`${e instanceof Error ? e.message : "No se pudo imprimir"} — se abre la impresión del navegador`);
        porNavegador();
      });
  }, [configImpresora]);

  const handleAbrirCajon = useCallback(() => {
    abrirCajon(configImpresora ?? leerConfigImpresora())
      .then(() => focusInput())
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo abrir el cajón"));
  }, [configImpresora, focusInput]);

  // Ticket de prueba en modo navegador: se muestra como "ultimo ticket" y se imprime.
  const handlePruebaNavegador = useCallback((ticket: TicketData) => {
    setLastTicket(ticket);
    setTimeout(() => window.print(), 150);
  }, []);

  const finalizarTicket = useCallback(
    (saleNumber: string, total: number, data: ConfirmData, userName?: string) => {
      const vuelto = data.changeAmount > 0 ? ` · Vuelto ${formatCurrency(data.changeAmount)}` : "";
      if (saleNumber !== "PENDIENTE") toast.success(`Ticket #${saleNumber}${vuelto}`);
      const ahorroOfertas = cart.items.reduce((s, i) => s + ahorroLinea(i.product, i.quantity), 0);
      anunciarVenta(total, ahorroOfertas);
      const ticket: TicketData = {
        comercio: nombreComercio.trim() || undefined,
        saleNumber,
        createdAt: new Date(),
        items: cart.items.map((i) => {
          const subtotal = precioLinea(i.product, i.quantity);
          return {
            name: i.product.name,
            quantity: i.quantity,
            price: i.quantity > 0 ? subtotal / i.quantity : 0,
            subtotal,
            unidad: i.product.unidad,
          };
        }),
        total,
        ahorroOfertas,
        // Publicidad al pie: ofertas de hoy que el cliente no se llevo
        ofertasDestacadas: (ofertasVigentes ?? [])
          .filter((p) => !cart.items.some((i) => i.product.id === p.id))
          .slice(0, OFERTAS_EN_TICKET)
          .map((p) => `${p.name} ${etiquetaOferta(p)} ${pesos(analizarOferta(p).totalPromo)}`),
        paymentMethod: data.paymentMethod,
        cashAmount: data.cashAmount,
        changeAmount: data.changeAmount,
        userName,
        pagadorNombre: data.pagadorNombre,
        cuotas: data.cuotas,
        recargoPct: data.recargoPct,
      };
      setLastTicket(ticket);
      cart.clear();
      setPresupuestoActivo(null);
      setPedidoActivo(null);
      setQuery("");
      setResults([]);
      focusInput();
      imprimirTicket(ticket);
    },
    [cart, focusInput, imprimirTicket, anunciarVenta, ofertasVigentes, nombreComercio],
  );

  const handleAprobadoQR = useCallback(
    async (ventaId: string) => {
      try {
        const venta = await getVentaById(ventaId);
        const saleNumber = venta?.saleNumber ?? ventaId;
        const total = venta?.total ?? cart.total;
        setCobroQR(null);
        setUltimaVentaId(ventaId);
        finalizarTicket(saleNumber, total, { paymentMethod: "mercadopago", cashAmount: 0, changeAmount: 0, transferAmount: total }, getCurrentUser()?.nombre);
      } catch {
        toast.error("El pago se acreditó pero no se pudo cerrar el ticket automáticamente");
      }
    },
    [cart.total, finalizarTicket],
  );

  const handleAprobadoPoint = useCallback(
    async (ventaId: string) => {
      try {
        const venta = await getVentaById(ventaId);
        const saleNumber = venta?.saleNumber ?? ventaId;
        const total = venta?.total ?? cart.total;
        setCobroPoint(null);
        setUltimaVentaId(ventaId);
        finalizarTicket(saleNumber, total, { paymentMethod: "mercadopago_point", cashAmount: 0, changeAmount: 0, transferAmount: total }, getCurrentUser()?.nombre);
      } catch {
        toast.error("El pago se acreditó pero no se pudo cerrar el ticket automáticamente");
      }
    },
    [cart.total, finalizarTicket],
  );

  const resolverDispositivoPoint = useCallback(async (): Promise<string> => {
    const guardado = getDispositivoGuardado();
    if (guardado) return guardado;
    const dispositivos = await listarDispositivosMP();
    if (dispositivos.length === 0) throw new Error("No hay lectores Point vinculados a esta cuenta de Mercado Pago");
    guardarDispositivo(dispositivos[0].id);
    return dispositivos[0].id;
  }, []);

  const handleConfirm = useCallback(
    async (data: ConfirmData) => {
      if (data.paymentMethod === "mercadopago_point") {
        // Mercado Pago es del plan Pro (el servidor lo valida igual).
        if (!planIncluyeMercadoPago(getCurrentUser()?.plan)) {
          toast.error(MENSAJE_MP_PRO);
          return;
        }
        setProcessing(true);
        try {
          const user = getCurrentUser();
          const deviceId = await resolverDispositivoPoint();
          const saleInput: CreateSaleInput = {
            items: cart.items.map((i) => ({
              productId: i.product.id,
              name: i.product.name,
              quantity: i.quantity,
              price: i.product.price,
            })),
            paymentMethod: "mercadopago_point",
            cashAmount: 0,
            changeAmount: 0,
            transferAmount: cart.total,
            cajaId,
            presupuestoId: presupuestoActivo?.id ?? null,
            pedidoId: pedidoActivo?.id ?? null,
            userId: user?.id,
            userName: user?.nombre,
          };
          const cobro = await cobrarConPoint(saleInput, cart.total, deviceId);
          setCobroPoint(cobro);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "No se pudo enviar el cobro al lector");
        } finally {
          setProcessing(false);
        }
        return;
      }

      if (data.paymentMethod === "mercadopago") {
        if (!planIncluyeMercadoPago(getCurrentUser()?.plan)) {
          toast.error(MENSAJE_MP_PRO);
          return;
        }
        setProcessing(true);
        try {
          const user = getCurrentUser();
          const saleInput: CreateSaleInput = {
            items: cart.items.map((i) => ({
              productId: i.product.id,
              name: i.product.name,
              quantity: i.quantity,
              price: i.product.price,
            })),
            paymentMethod: "mercadopago",
            cashAmount: 0,
            changeAmount: 0,
            transferAmount: cart.total,
            cajaId,
            presupuestoId: presupuestoActivo?.id ?? null,
            pedidoId: pedidoActivo?.id ?? null,
            userId: user?.id,
            userName: user?.nombre,
          };
          const cobro = await crearCobroQR(saleInput, cart.total);
          setCobroQR(cobro);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "No se pudo generar el cobro con QR");
        } finally {
          setProcessing(false);
        }
        return;
      }

      setProcessing(true);
      const user = getCurrentUser();
      const saleInput: CreateSaleInput = {
        items: cart.items.map((i) => ({
          productId: i.product.id,
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.price,
        })),
        paymentMethod: data.paymentMethod,
        cashAmount: data.cashAmount,
        changeAmount: data.changeAmount,
        transferAmount: data.transferAmount,
        cajaId,
        presupuestoId: presupuestoActivo?.id ?? null,
        pedidoId: pedidoActivo?.id ?? null,
        clienteId: data.clienteId,
        userId: user?.id,
        userName: user?.nombre,
        pagadorNombre: data.pagadorNombre,
        cuotas: data.cuotas,
        recargoPct: data.recargoPct,
        creditoMonto: data.creditoMonto,
        tarjetaMonto: data.tarjetaMonto,
        fiadoMonto: data.fiadoMonto,
        discount: data.discount,
      };

      try {
        let saleNumber: string;
        let total: number;

        if (data.paymentMethod === "fiado") {
          // El fiado necesita validar/actualizar el saldo del cliente en el momento: no se puede encolar offline.
          const res = await createSale(saleInput);
          saleNumber = res.saleNumber;
          total = res.total;
          setUltimaVentaId(res.id);
        } else {
          try {
            const res = await createSale(saleInput);
            saleNumber = res.saleNumber;
            total = res.total;
            setUltimaVentaId(res.id);
          } catch (e) {
            if (!(e instanceof NetworkUnavailableError)) throw e;
            await encolarVentaPendiente(saleInput);
            for (const i of cart.items) await descontarStockOffline(i.product.id, i.quantity);
            refreshPendingCount();
            saleNumber = "PENDIENTE";
            setUltimaVentaId(null); // offline: se factura desde Ventas cuando se sincronice
            total = cart.items.reduce((s, i) => s + precioLinea(i.product, i.quantity), 0);
            toast.warning("Sin conexión: venta guardada, se sincroniza sola al volver el internet");
          }
        }

        finalizarTicket(saleNumber, total, data, user?.nombre);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cobrar");
      } finally {
        setProcessing(false);
      }
    },
    [cart, cajaId, finalizarTicket, resolverDispositivoPoint, presupuestoActivo, pedidoActivo],
  );

  // Sin caja la venta queda con caja_id null y no entra en ningun cierre
  // (lib/server/caja.ts filtra por caja): el arqueo daria faltante.
  const eligeCaja = cajasAbiertas.length > 1 && getCurrentUser()?.rol !== "cajero";
  const avisoCaja = cajasCargadas && !cajaId ? (
    eligeCaja ? (
      <p>Elegí arriba en qué caja va esta venta.</p>
    ) : (
      <p>
        La caja está cerrada. Abrila para cobrar: así la venta entra en el cierre del día.
        Lo que tenés en el carrito te espera.{" "}
        <Link href="/caja?volver=pos" className="font-semibold text-primary underline-offset-2 hover:underline">Abrir caja</Link>
      </p>
    )
  ) : undefined;

  return (
    <main className="bg-mesh flex h-screen flex-col bg-muted/30">
      <AvisoSoporte />
      <header className="glass flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <Link
          href={panelHref(getCurrentUser()?.comercioSlug)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">Punto de Venta</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <Kbd>F2</Kbd> Cobrar
            <Kbd>F3</Kbd> Buscar
            <Kbd>Esc</Kbd> Limpiar
          </span>
          {!isOnline && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive">
              <WifiOff className="h-3.5 w-3.5" /> Sin conexión
            </span>
          )}
          {pendingCount > 0 && (
            <button
              onClick={() => setOfflineOpen(true)}
              className={
                conError > 0
                  ? "flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                  : "flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
              }
            >
              <RefreshCw className="h-3.5 w-3.5" /> {pendingCount} venta(s) sin sincronizar{conError > 0 ? ` · ${conError} con problema` : ""}
            </button>
          )}
          {ticketsEspera.length > 0 && (
            <button
              onClick={() => setEsperaOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
            >
              <PauseCircle className="h-3.5 w-3.5" /> En espera ({ticketsEspera.length})
            </button>
          )}
          <button
            onClick={() => window.open(apiUrl("/pantalla-cliente"), "pantalla-cliente", "popup,width=1280,height=800")}
            title="Abrir la pantalla del cliente (arrastrala al 2do monitor)"
            className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            <MonitorSmartphone className="h-3.5 w-3.5" /> Pantalla cliente
          </button>
          {configImpresora && modoPuedeAbrirCajon(configImpresora.modo) && (
            <button
              onClick={handleAbrirCajon}
              title="Abrir el cajón de dinero"
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Wallet className="h-3.5 w-3.5" /> Abrir cajón
            </button>
          )}
          <button
            onClick={venderVarios}
            title="Cobrar un importe suelto (recarga, fotocopia, varios)"
            className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <CircleDollarSign className="h-3.5 w-3.5" /> Varios
          </button>
          <button
            onClick={() => setImpresoraOpen(true)}
            title={conBalanza ? "Configurar la impresora de tickets y la balanza de esta PC" : "Configurar la impresora de tickets de esta PC"}
            className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" /> {conBalanza ? "Impresora y balanza" : "Impresora"}
          </button>
          {lastTicket && (
            <button
              onClick={() => lastTicket && imprimirTicket(lastTicket, true)}
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Printer className="h-3.5 w-3.5" /> Reimprimir
            </button>
          )}
          <FacturaPos ventaId={ultimaVentaId} />
          {!cajaId && cajasAbiertas.length > 1 && getCurrentUser()?.rol !== "cajero" ? (
            // Encargado/admin sin caja propia con varias abiertas: elige donde imputar.
            <select
              value=""
              onChange={(e) => setCajaId(e.target.value || undefined)}
              className="rounded-full border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning outline-none"
            >
              <option value="">Elegir caja…</option>
              {cajasAbiertas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.puestoNombre ?? c.id} · {c.abiertaPorNombre ?? "sin cajero"}
                </option>
              ))}
            </select>
          ) : (
            <Link
              href={cajaId ? "#" : "/caja"}
              onClick={(e) => cajaId && e.preventDefault()}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                cajaId ? "bg-success/15 text-success" : "bg-warning/15 text-warning hover:bg-warning/25",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  cajaId ? "bg-success animate-pulse-soft" : "bg-warning",
                )}
              />
              <ScanLine className="h-4 w-4" />
              {cajaId
                ? (cajasAbiertas.find((c) => c.id === cajaId)?.puestoNombre ?? "Caja abierta")
                : "Caja cerrada · abrir"}
            </Link>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_380px]">
        {/* Busqueda + resultados */}
        <div className="flex min-h-0 flex-col gap-3">
          {pedidoActivo && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span>
                Cobrando el <b>pedido N° {pedidoActivo.numero}</b> de {pedidoActivo.cliente} · ajustá lo que va por kg al pesarlo
              </span>
              <button
                onClick={() => setPedidoActivo(null)}
                className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Quitar
              </button>
            </div>
          )}
          {presupuestoActivo && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
              <span>
                Cobrando el <b>presupuesto N° {presupuestoActivo.numero}</b>
                {presupuestoActivo.vigente
                  ? <> · se respetan sus precios (vence el {presupuestoActivo.vence.split("-").reverse().join("/")})</>
                  : <> · <span className="text-warning">vencido: va a precio de hoy</span></>}
              </span>
              <button
                onClick={() => setPresupuestoActivo(null)}
                className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Quitar
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
              <Input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEnter();
                  }
                }}
                placeholder="Escaneá un código o buscá por nombre (150* para cantidad)"
                className="card-premium h-14 rounded-2xl border-0 pl-12 text-base font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              {multiplicador !== null && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">
                  × {multiplicador.toLocaleString("es-AR")}
                </span>
              )}
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              aria-label="Escanear con la cámara"
              className="card-premium flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-0 text-primary transition-colors hover:bg-primary/10"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border bg-card p-2">
            {textoBusqueda.trim().length < 2 ? (
              favoritos.length > 0 || (ofertasVigentes?.length ?? 0) > 0 ? (
                <div>
                  <OfertasRapidas ofertas={ofertasVigentes ?? []} onAgregar={(p) => addToCart(p)} />
                  {favoritos.length > 0 && (
                    <>
                      <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Productos rápidos</p>
                      <ul className="flex flex-col gap-1">
                        {favoritos.map((p) => {
                          const sinStock = p.stockControlado && p.stock <= 0;
                          return (
                            <li key={p.id}>
                              <button
                                onClick={() => { addToCart(p, multiplicador); if (multiplicador !== null) setQuery(""); }}
                                aria-disabled={sinStock}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                                  sinStock ? "opacity-50" : "hover:border-primary hover:bg-primary/5",
                                )}
                              >
                                <span className="line-clamp-1 text-sm font-medium">{p.name}</span>
                                <span className="shrink-0 text-sm font-semibold text-primary">{formatCurrency(precioFinal(p))}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Escribi al menos 2 letras o escanea un producto
                </p>
              )
            ) : searching ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((p) => {
                  const sinStock = p.stockControlado && p.stock <= 0;
                  const stockBajo = p.stockControlado && !sinStock && p.stock <= p.stockMinimo;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => { addToCart(p, multiplicador); if (multiplicador !== null) setQuery(""); }}
                        aria-disabled={sinStock}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                          sinStock ? "opacity-50" : "hover:border-primary hover:bg-primary/5",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">
                            {p.name}
                            {comboLabel(p) && (
                              <span className="ml-1.5 rounded-md bg-money/15 px-1.5 py-0.5 text-[10px] font-semibold text-money">
                                {comboLabel(p)}
                              </span>
                            )}
                          </p>
                          <span
                            className={cn(
                              "text-xs",
                              sinStock ? "text-destructive" : stockBajo ? "text-warning" : "text-muted-foreground",
                            )}
                          >
                            {!p.stockControlado ? "Sin control de stock" : sinStock ? "Sin stock" : `Stock: ${cantidadTexto(p.stock, p.unidad)}`}
                          </span>
                        </div>
                        <span className="shrink-0 text-right">
                          {tieneOferta(p) && (
                            <span className="mr-1.5 text-xs text-muted-foreground line-through">
                              {formatCurrency(p.price)}
                            </span>
                          )}
                          <span className={cn("text-sm font-semibold", tieneOferta(p) ? "text-money" : "text-primary")}>
                            {formatCurrency(precioFinal(p))}{porUnidad(p.unidad)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Carrito + cobro */}
        <div className="min-h-0">
          <CartPanel
            ref={cartRef}
            items={cart.items}
            total={cart.total}
            onSetQuantity={cambiarCantidad}
            onRemove={cart.removeProduct}
            onClear={cart.clear}
            onConfirm={handleConfirm}
            onSuspend={handleSuspender}
            onPresupuesto={conPresupuestos ? () => setPresupuestoOpen(true) : undefined}
            processing={processing}
            isOnline={isOnline}
            avisoBloqueo={avisoCaja}
          />
        </div>
      </div>

      <PesoDialog product={pesoProduct} onOpenChange={(o) => !o && setPesoProduct(null)} onConfirm={confirmarPeso} />
      <PresupuestoDialog
        open={presupuestoOpen}
        onOpenChange={setPresupuestoOpen}
        items={cart.items}
        nombreComercio={nombreComercio.trim() || getCurrentUser()?.comercioNombre || ""}
        onGuardado={() => { cart.clear(); setPresupuestoActivo(null); focusInput(); }}
      />
      <ImporteLibreDialog
        product={importeLibreProduct}
        onOpenChange={(o) => !o && setImporteLibreProduct(null)}
        onConfirm={(importe) => importeLibreProduct && cart.addPrecioLibre(importeLibreProduct, importe)}
      />
      <TicketPrint ticket={lastTicket} />
      <ImpresoraDialog
        open={impresoraOpen}
        onOpenChange={(o) => {
          setImpresoraOpen(o);
          if (!o) focusInput();
        }}
        nombreComercio={nombreComercio.trim() || undefined}
        onChanged={setConfigImpresora}
        onPruebaNavegador={handlePruebaNavegador}
        conBalanza={conBalanza}
      />
      <VentasOfflineDialog
        open={offlineOpen}
        onOpenChange={setOfflineOpen}
        pendientes={pendientes}
        cajaIdActual={cajaId}
        onCambio={refreshPendingCount}
        onSincronizarTodo={() => syncVentasPendientes()}
      />
      <TicketsEsperaDialog
        open={esperaOpen}
        onOpenChange={setEsperaOpen}
        tickets={ticketsEspera}
        onRecuperar={handleRecuperar}
        onDescartar={handleDescartarEspera}
      />
      <MercadoPagoQrDialog
        cobro={cobroQR}
        total={cart.total}
        onOpenChange={(o) => !o && setCobroQR(null)}
        onAprobado={handleAprobadoQR}
      />
      <MercadoPagoPointDialog
        cobro={cobroPoint}
        total={cart.total}
        onOpenChange={(o) => !o && setCobroPoint(null)}
        onAprobado={handleAprobadoPoint}
      />
      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScanDetected}
      />
      <QuickCreateProductDialog
        open={codigoNoEncontrado !== null}
        codigoBarras={codigoNoEncontrado ?? ""}
        onOpenChange={(o) => !o && setCodigoNoEncontrado(null)}
        onCreated={handleProductoCreado}
      />
    </main>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
      {children}
    </kbd>
  );
}
