import Link from 'next/link'
import { CONTACT, LEGAL } from '@/lib/marketing/contact'
import { Brand } from './shared'
import { WhatsAppLink } from '@/components/analytics/whatsapp-link'

const linkCls = 'text-sm text-muted-foreground transition-colors hover:text-white'

export function SiteFooter() {
  return (
    <footer id="contacto" className="border-t border-white/[0.06] bg-[#050a16] pt-16 pb-8">
      <div className="mx-auto max-w-6xl px-5 md:px-7">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
          <div className="max-w-sm">
            <Brand />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Punto de venta 100% web para kioscos, supermercados, panaderías, verdulerías y comercios de Argentina.
            </p>
          </div>
          <div>
            <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">Producto</h3>
            <ul className="flex flex-col gap-2.5">
              <li><a className={linkCls} href="#diferencias">Diferencias</a></li>
              <li><a className={linkCls} href="#rubros">Rubros</a></li>
              <li><a className={linkCls} href="#plataforma">Plataforma</a></li>
              <li><a className={linkCls} href="#modulos">Módulos</a></li>
              <li><a className={linkCls} href="#seguridad">Seguridad</a></li>
              <li><a className={linkCls} href="#faq">Preguntas frecuentes</a></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">Contacto</h3>
            <ul className="flex flex-col gap-2.5">
              <li><a className={linkCls} href={`mailto:${CONTACT.email}`}>Escribinos por email</a></li>
              <li>
                <WhatsAppLink ubicacion="footer" className={linkCls}>
                  Hablar por WhatsApp
                </WhatsAppLink>
              </li>
              {/* Link (no <a>): en produccion agrega el basePath /comercio */}
              <li><Link className={linkCls} href="/terms" prefetch={false}>Términos y Condiciones</Link></li>
              <li><Link className={linkCls} href="/privacy" prefetch={false}>Política de Privacidad</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© 2026 {LEGAL.ownerDisplayName} · {LEGAL.jurisdiction}</span>
          <span>
            Desarrollado por{' '}
            <a href={CONTACT.servitecUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2 hover:text-white">
              {LEGAL.developerName}
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
