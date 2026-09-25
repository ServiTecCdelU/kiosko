import Link from 'next/link'
import { Store } from 'lucide-react'
import { cn } from '@/lib/utils'

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-[18px]', className)}
    >
      <path d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5s.8 1.9.8 2c.1.1.1.3 0 .5-.3.6-.6.8-.4 1.1.7 1.2 1.6 2 2.8 2.6.3.2.5.1.7-.1l.7-.8c.2-.3.4-.2.7-.1s1.7.8 2 1c.3.1.5.2.5.3.1.1.1.7-.1 1.3z" />
    </svg>
  )
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-white">
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-primary text-white shadow-[0_6px_20px_-6px_rgba(59,139,255,0.7)]">
        <Store className="size-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span className="text-[1.05rem]">
        Comercio<span className="text-accent">Platform</span>
      </span>
    </Link>
  )
}

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-3.5 inline-block font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent">
      {children}
    </span>
  )
}

export function SectionHead({
  kicker,
  title,
  text,
  id,
  className,
}: {
  kicker: string
  title: string
  text?: string
  id: string
  className?: string
}) {
  return (
    <div data-animate className={cn('mb-12 max-w-2xl', className)}>
      <Kicker>{kicker}</Kicker>
      <h2
        id={id}
        className="mb-3 text-balance text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl"
      >
        {title}
      </h2>
      {text ? <p className="text-pretty text-lg text-muted-foreground">{text}</p> : null}
    </div>
  )
}

export const btnPrimary =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 font-semibold text-primary-foreground shadow-[0_8px_32px_-8px_rgba(59,139,255,0.65)] transition hover:-translate-y-0.5 hover:bg-[#5a9dff] hover:shadow-[0_14px_40px_-8px_rgba(59,139,255,0.75)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary/40'

export const btnGhost =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-7 py-3.5 font-semibold text-slate-200 transition hover:border-accent/50 hover:bg-accent/5 hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent/40'
