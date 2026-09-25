import Link from 'next/link'
import { Check, Plus } from 'lucide-react'
import { CONTACT, ROUTES, TRIAL_DAYS } from '@/lib/marketing/contact'
import { Kicker, SectionHead, WhatsAppIcon } from './shared'

const STEPS = [
  { n: '01', title: 'Creá tu cuenta', text: 'Registrate y configurá tu comercio, cajas y cajeros en minutos.' },
  { n: '02', title: 'Cargá tus productos', text: 'Importalos desde Excel o sincronizá el catálogo de tu distribuidora.' },
  { n: '03', title: 'Empezá a vender', text: 'Abrí la caja, escaneá y cobrá desde el primer día.' },
]

export function Steps() {
  return (
    <section id="como-funciona" aria-labelledby="pasos-heading" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead id="pasos-heading" kicker="Cómo funciona" title="Arrancás en tres pasos" />
        <div className="stagger grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} data-animate className="rounded-2xl border border-border bg-card p-7">
              <div className="mb-5 bg-gradient-to-br from-sky-300 to-primary bg-clip-text font-mono text-4xl font-semibold text-transparent">
                {s.n}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const SECURITY = [
  { title: 'Aislamiento por comercio', text: 'Cada comercio ve únicamente su información, garantizado a nivel base de datos.' },
  { title: 'Permisos por cajero', text: 'Definís quién puede anular tickets, hacer descuentos o ver reportes.' },
  { title: 'Auditoría', text: 'Anulaciones y cambios de precio quedan registrados y no se pueden borrar.' },
  { title: 'Infraestructura en la nube', text: 'Respaldos automáticos y disponibilidad gestionada, sin servidores propios.' },
]

export function Security() {
  return (
    <section id="seguridad" aria-labelledby="seguridad-heading" className="bg-[#081021] py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 md:px-7 lg:grid-cols-2">
        <div data-animate>
          <Kicker>Seguridad</Kicker>
          <h2 id="seguridad-heading" className="mb-4 text-balance text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
            Tus datos son tuyos, y de nadie más.
          </h2>
          <p className="max-w-md text-pretty text-lg text-muted-foreground">
            La plataforma se diseñó desde el primer día para operar múltiples comercios con aislamiento total de la información.
          </p>
        </div>
        <ul className="stagger flex flex-col gap-3">
          {SECURITY.map((s) => (
            <li key={s.title} data-animate className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sky-300">
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              <div>
                <b className="block font-semibold text-white">{s.title}</b>
                <span className="text-sm text-muted-foreground">{s.text}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const FAQS = [
  { q: '¿Necesito instalar algo?', a: 'No. Es 100% web: funciona desde cualquier computadora, tablet o celular con navegador.' },
  { q: '¿Funciona con lector de código de barras?', a: 'Sí. Cualquier lector USB o Bluetooth funciona: conectás y escaneás directo en el punto de venta.' },
  { q: '¿Puedo tener varias cajas abiertas?', a: 'Sí. Cada caja tiene su apertura, cierre y arqueo, con el detalle de qué cajero la operó.' },
  { q: '¿Sirve si vendo por kilo?', a: 'Sí. Podés vender por unidad o por peso. La integración con balanzas etiquetadoras llega próximamente.' },
  { q: '¿Emite factura electrónica?', a: 'Estamos preparando la integración con ARCA. Hoy podés emitir tickets internos y gestionar el fiado; la facturación electrónica llega próximamente.' },
  { q: '¿Cuánto cuesta?', a: 'Estamos definiendo los planes. Escribinos por WhatsApp y lo vemos según el tamaño de tu comercio.' },
]

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5 md:px-7">
        <SectionHead id="faq-heading" kicker="Preguntas frecuentes" title="Lo que siempre nos preguntan" className="mx-auto text-center" />
        <div data-animate className="flex flex-col gap-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-border bg-card px-6 open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" aria-hidden="true" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaFinal() {
  return (
    <section id="cta-final" aria-labelledby="ctafinal-heading" className="px-5 pb-24 md:px-7">
      <div
        data-animate
        className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-blue-600 to-blue-900 px-6 py-16 text-center shadow-[0_40px_100px_-30px_rgba(37,99,235,0.7)] md:py-20"
      >
        <div aria-hidden="true" className="absolute -right-20 -top-20 size-72 rounded-full bg-cyan-300/30 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 -left-16 size-72 rounded-full bg-blue-400/30 blur-3xl" />
        <div className="relative">
          <h2 id="ctafinal-heading" className="mx-auto max-w-2xl text-balance text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl">
            Probá el sistema en tu propio mostrador.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-blue-50/85">
            Creá tu cuenta, cargá tus productos y hacé tu primera venta hoy mismo.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={CONTACT.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-blue-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
            >
              <WhatsAppIcon />
              Hablar por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
