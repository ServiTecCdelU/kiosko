import {
  Beef,
  BookOpen,
  Candy,
  Carrot,
  Coffee,
  Croissant,
  ShoppingBasket,
  Store,
  Wrench,
} from 'lucide-react'
import { SectionHead } from './shared'

const RUBROS = [
  { icon: Candy, name: 'Kioscos', text: 'Venta rápida con escáner, golosinas y cigarrillos al toque.' },
  { icon: ShoppingBasket, name: 'Supermercados', text: 'Varias cajas en simultáneo, ofertas y miles de productos.' },
  { icon: Croissant, name: 'Panaderías', text: 'Venta por kilo o unidad y producción del día.' },
  { icon: Carrot, name: 'Verdulerías', text: 'Precios por kilo que cambian todos los días, sin drama.' },
  { icon: Store, name: 'Almacenes', text: 'Fiado del barrio con límite de crédito por cliente.' },
  { icon: Beef, name: 'Carnicerías', text: 'Cortes por peso, balanza y control de merma.' },
  { icon: Coffee, name: 'Dietéticas', text: 'Productos sueltos, fraccionados y vencimientos.' },
  { icon: Wrench, name: 'Ferreterías', text: 'Miles de códigos, variantes y proveedores.' },
  { icon: BookOpen, name: 'Librerías', text: 'Temporada escolar, combos y stock por rubro.' },
]

export function Rubros() {
  return (
    <section id="rubros" aria-labelledby="rubros-heading" className="border-y border-white/[0.05] bg-[#081021] py-14 sm:py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="rubros-heading"
          kicker="Para tu rubro"
          title="Hecho para el comercio de todos los días."
          text="Si vendés al público por mostrador o con changuito, el sistema se adapta a cómo trabajás."
        />
        <ul className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3">
          {RUBROS.map((r) => (
            <li
              key={r.name}
              data-animate
              className="group flex flex-col gap-3 rounded-2xl max-lg:last:odd:col-span-2 border border-border bg-card/70 p-4 transition sm:flex-row sm:items-start sm:gap-4 sm:p-5 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-sky-300 ring-1 ring-primary/20 transition sm:size-11 group-hover:bg-primary group-hover:text-white">
                <r.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white sm:text-base">{r.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
