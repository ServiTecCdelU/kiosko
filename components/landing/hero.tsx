import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CONTACT, ROUTES, TRIAL_DAYS } from '@/lib/marketing/contact'
import { PosMock } from './pos-mock'
import { WhatsAppIcon, btnGhost, btnPrimary } from './shared'

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden pb-20 pt-16 md:pb-28 md:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(59,139,255,0.28),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,180,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,180,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-5 text-center md:px-7">
        <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 font-mono text-xs text-sky-200">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          Punto de venta para comercios · Argentina
        </div>

        <h1
          id="hero-heading"
          className="mx-auto max-w-4xl text-balance text-5xl font-bold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl md:text-7xl lg:text-[5.2rem]"
        >
          Tu comercio,
          <br />
          <span className="bg-gradient-to-r from-sky-300 via-primary to-blue-500 bg-clip-text text-transparent">
            cobrando en segundos.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
          Caja, ventas con escáner, stock, fiado y vencimientos en un solo lugar. Para kioscos,
          supermercados, panaderías, verdulerías y almacenes de barrio.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
            <WhatsAppIcon />
            Hablar por WhatsApp
          </a>
        </div>
        <p className="mt-5 font-mono text-xs text-muted-foreground/80">
          Sin instalación · Funciona en PC, tablet y celular
        </p>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <div
            aria-hidden="true"
            className="absolute -inset-x-10 -top-10 bottom-0 rounded-[3rem] bg-primary/20 blur-3xl"
          />
          <div className="relative">
            <PosMock />
          </div>
        </div>
      </div>
    </section>
  )
}
