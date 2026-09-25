import Link from 'next/link'
import { CONTACT, ROUTES } from '@/lib/marketing/contact'
import { Brand } from './shared'

const NAV = [
  { href: '#rubros', label: 'Rubros' },
  { href: '#plataforma', label: 'Plataforma' },
  { href: '#modulos', label: 'Módulos' },
  { href: '#seguridad', label: 'Seguridad' },
  { href: '#faq', label: 'FAQ' },
]

export function SiteHeader() {
  return (
    <header
      id="navbar"
      className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl transition-shadow [&.scrolled]:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.8)]"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 md:px-7">
        <Brand />
        <nav aria-label="Navegación principal" className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Link
            href={ROUTES.login}
            className="hidden text-sm font-medium text-slate-300 transition-colors hover:text-white sm:inline"
          >
            Ingresar
          </Link>
          <a
            href={CONTACT.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_6px_24px_-8px_rgba(59,139,255,0.7)] transition hover:bg-[#5a9dff]"
          >
            Hablar por WhatsApp
          </a>
        </div>
      </div>
    </header>
  )
}
