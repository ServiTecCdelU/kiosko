import {
  CalendarClock,
  ChartColumn,
  FileSpreadsheet,
  FileText,
  Package,
  Receipt,
  RefreshCw,
  Scale,
  ScanBarcode,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
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
    <section aria-labelledby="beneficios-heading" className="py-20 md:py-28">
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
              className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-[#08111f] p-6"
            >
              <div aria-hidden="true" className="absolute -right-12 -top-12 size-32 rounded-full bg-primary/15 blur-2xl" />
              <span className="relative mb-5 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_8px_24px_-8px_rgba(59,139,255,0.8)]">
                <b.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="relative mb-2 text-lg font-semibold text-white">{b.title}</h3>
              <p className="relative text-sm leading-relaxed text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const MODULES: { icon: LucideIcon; title: string; text: string; soon?: boolean }[] = [
  { icon: ShoppingCart, title: 'Punto de venta', text: 'Escaneá, cobrá y emití el ticket en segundos.' },
  { icon: Wallet, title: 'Caja', text: 'Apertura, cierre y arqueo por turno y cajero.' },
  { icon: Receipt, title: 'Ventas', text: 'Historial de tickets, devoluciones y anulaciones.' },
  { icon: Users, title: 'Clientes', text: 'Fiado y cuenta corriente con límite de crédito.' },
  { icon: Package, title: 'Stock', text: 'Inventario, alertas de faltantes y ajustes.' },
  { icon: CalendarClock, title: 'Vencimientos', text: 'Avisos de lo que vence esta semana.' },
  { icon: Truck, title: 'Compras', text: 'Pedidos a proveedores y recepción de mercadería.' },
  { icon: UserCog, title: 'Usuarios', text: 'Cada cajero ve solo lo que le corresponde.' },
  { icon: ChartColumn, title: 'Reportes', text: 'Ventas, márgenes y productos más vendidos.' },
  { icon: RefreshCw, title: 'Sincronización', text: 'Catálogo y precios actualizados de tu distribuidora.' },
  { icon: FileSpreadsheet, title: 'Importación Excel', text: 'Traé tus productos y precios en minutos.' },
  { icon: Scale, title: 'Balanza', text: 'Venta por peso con etiquetas de balanza.', soon: true },
  { icon: FileText, title: 'Factura electrónica', text: 'Preparado para ARCA.', soon: true },
]

export function Modules() {
  return (
    <section id="modulos" aria-labelledby="modulos-heading" className="bg-[#081021] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="modulos-heading"
          kicker="Módulos"
          title="Todo lo que tu comercio necesita"
          text="Sin plugins ni sistemas paralelos: los módulos que se usan de verdad en el mostrador."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div
              key={m.title}
              className="relative flex items-start gap-4 rounded-2xl border border-border bg-card/80 p-5 transition hover:border-primary/40"
            >
              {m.soon ? (
                <span className="absolute right-4 top-4 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
                  Próximamente
                </span>
              ) : null}
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-sky-300 ring-1 ring-primary/20">
                <m.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="pr-16">
                <h3 className="font-semibold text-white">{m.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
