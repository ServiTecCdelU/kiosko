import {
  BadgePercent,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Gift,
  Handshake,
  Lightbulb,
  Monitor,
  Package,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Scale,
  ScanBarcode,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  UserCog,
  Users,
  Wallet,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { SectionHead } from './shared'

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ScanBarcode,
    title: 'Cobrás en segundos',
    text: 'Escaneás, elegís medio de pago y listo. Efectivo, débito, crédito, QR o transferencia, todo en el mismo ticket.',
  },
  {
    icon: Wallet,
    title: 'Caja que cuadra',
    text: 'Apertura, movimientos y arqueo por cajero y por turno. Las diferencias se ven en el momento, no a fin de mes.',
  },
  {
    icon: CalendarClock,
    title: 'Stock y vencimientos',
    text: 'Alertas de stock bajo y de productos que vencen esta semana, para reponer o liquidar antes de perder plata.',
  },
  {
    icon: Users,
    title: 'Fiado bajo control',
    text: 'Cuenta corriente por cliente con límite de crédito. Sabés cuánto te deben antes de volver a fiar.',
  },
]

export function Benefits() {
  return (
    <section aria-labelledby="beneficios-heading" className="py-14 sm:py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="beneficios-heading"
          kicker="Beneficios"
          title="Orden real, desde el primer día"
          text="Cuatro cosas que cambian en tu mostrador desde la primera semana."
        />
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              data-animate
              className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-[#08111f] p-5 sm:p-6"
            >
              <div aria-hidden="true" className="absolute -right-12 -top-12 size-32 rounded-full bg-primary/15 blur-2xl" />
              {/* En el celular el icono va al lado del titulo: la tarjeta queda mas baja. */}
              <div className="relative mb-2 flex items-center gap-3 sm:block">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_8px_24px_-8px_rgba(59,139,255,0.8)] sm:mb-5 sm:size-12">
                  <b.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold text-white sm:text-lg">{b.title}</h3>
              </div>
              <p className="relative text-sm leading-relaxed text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const MODULES: { icon: LucideIcon; title: string; text: string; soon?: boolean; pro?: boolean }[] = [
  { icon: ShoppingCart, title: 'Punto de venta', text: 'Escaneá, cobrá y emití el ticket en segundos. Pago mixto y tickets en espera.' },
  { icon: Wallet, title: 'Caja', text: 'Apertura, cierre y arqueo por turno y cajero, con gastos por categoría.' },
  { icon: Store, title: 'Varias cajas', text: 'Cada caja con su cajero y su arqueo, y el consolidado del día.', pro: true },
  { icon: WifiOff, title: 'Sin internet', text: 'Seguís cobrando si se corta la conexión; las ventas se suben solas.' },
  { icon: Receipt, title: 'Ventas', text: 'Historial de tickets, devoluciones y anulaciones.' },
  { icon: Users, title: 'Clientes', text: 'Fiado y cuenta corriente con límite de crédito.' },
  { icon: Gift, title: 'Puntos y sorteos', text: 'Premios por compras y sorteos entre tus clientes.' },
  { icon: Package, title: 'Stock', text: 'Alertas de faltantes, ajustes y favoritos para cobrar más rápido.' },
  { icon: ClipboardCheck, title: 'Inventario y mermas', text: 'Recuento físico, faltantes y roturas con su motivo y su costo.' },
  { icon: CalendarClock, title: 'Vencimientos', text: 'Vencimiento por lote y aviso de lo que vence esta semana.' },
  { icon: Lightbulb, title: 'Recomendaciones', text: 'Qué ofertar, qué reponer y cuánto pedir, todos los días.' },
  { icon: BadgePercent, title: 'Ofertas y combos', text: '2x1, descuentos y combos con fecha, simulador de margen y resultados.' },
  { icon: Tags, title: 'Carteles y etiquetas', text: 'Etiquetas de góndola, carteles, folleto e imagen para redes.' },
  { icon: Monitor, title: 'Pantalla del cliente y TV', text: 'El cliente ve lo que paga y cuánto ahorra; la TV pasa tus ofertas.' },
  { icon: Truck, title: 'Compras', text: 'Pedidos y recepción, cargados desde la factura del proveedor.' },
  { icon: Handshake, title: 'Proveedores', text: 'Cuenta corriente, pagos parciales y aviso de lo que vence pagar.' },
  { icon: UserCog, title: 'Empleados', text: 'Cada cajero entra con su PIN y ve solo lo que le corresponde.' },
  { icon: ChartColumn, title: 'Reportes', text: 'Ventas, márgenes, horarios pico, gastos y pérdidas, en Excel o PDF.' },
  { icon: Printer, title: 'Impresora y cajón', text: 'Ticket en impresora térmica y cajón de dinero que se abre solo.' },
  { icon: Scale, title: 'Balanza', text: 'Venta por peso y lectura de las etiquetas de la balanza.' },
  { icon: FileSpreadsheet, title: 'Importación Excel', text: 'Traé tus productos y precios en minutos.' },
  { icon: RefreshCw, title: 'Sincronización', text: 'Catálogo y precios actualizados de tu distribuidora.' },
  { icon: QrCode, title: 'Cobros con Mercado Pago', text: 'QR y lector Point conectados a la venta, con tu propia cuenta.', pro: true },
  { icon: FileText, title: 'Factura electrónica', text: 'Factura A, B y C de ARCA con CAE y QR, desde la venta.', pro: true },
]

export function Modules() {
  return (
    <section id="modulos" aria-labelledby="modulos-heading" className="bg-[#081021] py-14 sm:py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="modulos-heading"
          kicker="Módulos"
          title="Todo lo que tu comercio necesita"
          text="Sin plugins ni sistemas paralelos: los módulos que se usan de verdad en el mostrador."
        />
        {/* En el celular van de a dos, con el icono arriba: 24 modulos en una columna eran 4 metros de scroll. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div
              key={m.title}
              className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-4 transition hover:border-primary/40 sm:flex-row sm:items-start sm:gap-4 sm:p-5"
            >
              {m.soon ? (
                <span className="absolute right-3 top-3 rounded-full border border-accent/30 sm:right-4 sm:top-4 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
                  Próximamente
                </span>
              ) : m.pro ? (
                <span className="absolute right-3 top-3 rounded-full border border-primary/40 sm:right-4 sm:top-4 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-sky-300">
                  Plan Pro
                </span>
              ) : null}
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-sky-300 ring-1 ring-primary/20 sm:size-11">
                <m.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 sm:pr-16">
                <h3 className="text-sm font-semibold leading-snug text-white sm:text-base">{m.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
