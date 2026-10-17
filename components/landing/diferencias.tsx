import {
  FileText,
  Lightbulb,
  Megaphone,
  PackagePlus,
  Smartphone,
  Tag,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { SectionHead } from './shared'

// Lo que el sistema hace y otros no suelen hacer. Todo existe en el producto:
// recomendaciones (components/stock/recomendaciones.tsx), carteles por cambio
// de precio, ofertas sugeridas (lib/oferta-sugerencias.ts), cola offline
// (lib/offline/), "Pedí más" (lib/pedir-mas.ts) y la factura del proveedor
// leida del PDF o del QR (components/compras/factura-afip-dialog.tsx).
const DIFERENCIAS: { icon: LucideIcon; title: string; text: string; ejemplo: string }[] = [
  {
    icon: Lightbulb,
    title: 'Te dice qué hacer hoy',
    text: 'Recomendaciones todos los días: qué ofertar porque vence, qué mercadería está quieta, qué se te agota y qué promo no está vendiendo. Cada una con su acción lista.',
    ejemplo: 'Yogur x6 vence en 3 días · ofertalo',
  },
  {
    icon: Tag,
    title: 'Te avisa qué carteles reimprimir',
    text: 'Cambiaste un precio y el sistema te lo anota. Imprimís de una vez las etiquetas de góndola que quedaron viejas: el precio del estante siempre igual al de la caja.',
    ejemplo: '4 carteles por reimprimir · cambió el precio',
  },
  {
    icon: Megaphone,
    title: 'Te arma las ofertas y los carteles',
    text: 'Te sugiere qué ofertar sin perder margen y te hace el cartel, el folleto y la imagen para WhatsApp o Instagram. Después te muestra si la oferta está vendiendo más.',
    ejemplo: 'Cartel A4 + imagen para Instagram, listos',
  },
  {
    icon: WifiOff,
    title: 'Sigue cobrando sin internet',
    text: 'Si se corta la conexión, la caja no se frena: buscás productos, cobrás y las ventas se guardan. Cuando vuelve internet se suben solas, sin perder ninguna.',
    ejemplo: 'Sin conexión · 3 ventas se suben al volver',
  },
  {
    icon: PackagePlus,
    title: 'Te dice cuánto pedir',
    text: 'Detecta lo que se vende rápido (o más rápido que antes) y te sugiere cuánto pedirle al proveedor para no quedarte sin stock justo el fin de semana.',
    ejemplo: 'Gaseosa 2,25 L se agota en 2 días · pedí 12',
  },
  {
    icon: FileText,
    title: 'Cargás la compra con la factura',
    text: 'Subís el PDF del proveedor o le sacás una foto al QR de ARCA: proveedor, número, fecha y total se cargan solos, y los renglones se asocian a tus productos.',
    ejemplo: 'Factura del proveedor leída del QR',
  },
]

export function Diferencias() {
  return (
    <section id="diferencias" aria-labelledby="diferencias-heading" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="diferencias-heading"
          kicker="Lo que nos diferencia"
          title="No solo guarda tus ventas: te dice qué hacer."
          text="La mayoría de los sistemas registran lo que pasó. Este además te avisa qué ofertar, qué reponer y qué cartel cambiar, sigue cobrando aunque se corte internet y lo controlás desde el celular."
        />
        {/* Destacada, a lo ancho: el dueño entra con Google desde cualquier
            celular y ve el inicio del panel (ventas de hoy, cajas abiertas y
            quien atiende, stock bajo) y el stock de cualquier producto. */}
        <div
          data-animate
          className="relative mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-[#08111f] p-6 md:p-8"
        >
          <div aria-hidden="true" className="absolute -right-16 -top-16 size-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_8px_24px_-8px_rgba(59,139,255,0.8)]">
              <Smartphone className="size-6" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <h3 className="mb-2 text-xl font-semibold text-white md:text-2xl">Tu negocio en el celular, aunque no estés en el local</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Desde tu casa o de viaje, entrás con tu cuenta de Google y ves cuánto se vendió hoy y a qué hora, qué cajas
                están abiertas y quién atiende, y si te queda stock de un producto. Todo al momento, sin llamar al local.
              </p>
            </div>
            <ul className="flex shrink-0 flex-col gap-2 font-mono text-xs text-sky-200">
              {['Ventas de hoy · $284.650', 'Caja 1 abierta · atiende Ana', 'Leche 1 L · quedan 4'].map((e) => (
                <li key={e} className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">{e}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DIFERENCIAS.map((d) => (
            <div
              key={d.title}
              data-animate
              className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-[#08111f] p-6 transition hover:border-primary/40"
            >
              <div aria-hidden="true" className="absolute -right-12 -top-12 size-32 rounded-full bg-primary/15 blur-2xl" />
              <span className="relative mb-5 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_8px_24px_-8px_rgba(59,139,255,0.8)]">
                <d.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="relative mb-2 text-lg font-semibold text-white">{d.title}</h3>
              <p className="relative flex-1 text-sm leading-relaxed text-muted-foreground">{d.text}</p>
              <p className="relative mt-5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 font-mono text-xs text-sky-200">
                {d.ejemplo}
              </p>
            </div>
          ))}
        </div>
        <p data-animate className="mt-10 text-lg text-muted-foreground">
          Y además: pantalla para que el cliente vea lo que paga y cuánto ahorra, TV de ofertas, balanza, cajón de dinero y{' '}
          <strong className="font-semibold text-white">factura electrónica desde la venta.</strong>
        </p>
      </div>
    </section>
  )
}
