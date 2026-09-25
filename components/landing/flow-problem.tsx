import { Fragment } from 'react'
import { SectionHead } from './shared'

const FLOW_STEPS = ['Escaneo', 'Cobro', 'Stock', 'Caja', 'Reportes']

export function Flow() {
  return (
    <section id="plataforma" aria-labelledby="flow-heading" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead
          id="flow-heading"
          kicker="Operación conectada"
          title="Vendés una vez, todo se actualiza solo."
          text="Cada ticket descuenta stock, suma a la caja y alimenta tus reportes. Sin cargar nada dos veces."
        />
        <div data-animate className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          {FLOW_STEPS.map((step, i) => (
            <Fragment key={step}>
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 font-mono text-sm text-slate-200">
                <span className="text-xs text-primary">{String(i + 1).padStart(2, '0')}</span>
                {step}
              </div>
              <div
                aria-hidden="true"
                className="mx-auto h-5 w-px bg-gradient-to-b from-primary/60 to-accent/60 md:h-px md:w-auto md:flex-1 md:bg-gradient-to-r"
              />
            </Fragment>
          ))}
          <div className="rounded-xl bg-gradient-to-r from-sky-500 to-primary px-5 py-3.5 text-center font-mono text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(59,139,255,0.8)]">
            Decisión
          </div>
        </div>
      </div>
    </section>
  )
}

const PROBLEMS = [
  {
    tag: '// caja_que_no_cierra',
    title: 'La caja nunca cuadra',
    text: 'Al final del día falta plata o sobra, y nadie sabe en qué turno pasó.',
  },
  {
    tag: '// fiado_en_cuaderno',
    title: 'El fiado vive en un cuaderno',
    text: 'Clientes que deben hace meses y un cuaderno que se moja, se pierde o nadie entiende.',
  },
  {
    tag: '// vencimientos_ocultos',
    title: 'Te enterás tarde de lo vencido',
    text: 'Lácteos, fiambres y panificados que se tiran porque nadie avisó a tiempo.',
  },
]

export function Problem() {
  return (
    <section aria-labelledby="problema-heading" className="bg-[#081021] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <SectionHead id="problema-heading" kicker="El problema" title="¿Te suena?" />
        <div className="stagger grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div
              key={p.tag}
              data-animate
              className="rounded-2xl border border-border bg-card p-6 transition hover:border-destructive/30"
            >
              <div className="mb-4 font-mono text-xs text-destructive">{p.tag}</div>
              <h3 className="mb-2 text-lg font-semibold text-white">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
        <p data-animate className="mt-10 text-lg text-muted-foreground">
          Si tu comercio funciona así, no es mala suerte:{' '}
          <strong className="font-semibold text-white">es falta de sistema.</strong>
        </p>
      </div>
    </section>
  )
}
