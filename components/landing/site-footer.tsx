import { CONTACT, LEGAL } from '@/lib/marketing/contact'
import { Brand } from './shared'

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
            <h4 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">Producto</h4>
            <ul className="flex flex-col gap-2.5">
              <li><a className={linkCls} href="#rubros">Rubros</a></li>
              <li><a className={linkCls} href="#plataforma">Plataforma</a></li>
              <li><a className={linkCls} href="#modulos">Módulos</a></li>
              <li><a className={linkCls} href="#seguridad">Seguridad</a></li>
              <li><a className={linkCls} href="#faq">Preguntas frecuentes</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">Contacto</h4>
            <ul className="flex flex-col gap-2.5">
              <li><a className={linkCls} href={`mailto:${CONTACT.email}`}>Escribinos por email</a></li>
              <li>
                <a className={linkCls} href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  Hablar por WhatsApp
                </a>
              </li>
              <li><a className={linkCls} href="/terms">Términos y Condiciones</a></li>
              <li><a className={linkCls} href="/privacy">Política de Privacidad</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© 2026 {LEGAL.ownerDisplayName} · {LEGAL.jurisdiction}</span>
          <span>
            Desarrollado por{' '}
            <a href={CONTACT.servitecUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:text-white">
              {LEGAL.developerName}
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
