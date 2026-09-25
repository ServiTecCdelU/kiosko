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
    <section id="rubros" aria-labelledby="rubros-heading" className="border-y border-white/[0.05] bg-[#081021] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="rubros-heading"
          kicker="Para tu rubro"
          title="Hecho para el comercio de todos los días."
          text="Si vendés al público por mostrador o con changuito, el sistema se adapta a cómo trabajás."
        />
        <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RUBROS.map((r) => (
            <li
              key={r.name}
              data-animate
              className="group flex items-start gap-4 rounded-2xl border border-border bg-card/70 p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-sky-300 ring-1 ring-primary/20 transition group-hover:bg-primary group-hover:text-white">
                <r.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold text-white">{r.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
