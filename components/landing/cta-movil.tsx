import Link from 'next/link'
import { PlayCircle } from 'lucide-react'
import { ROUTES, TRIAL_DAYS } from '@/lib/marketing/contact'

// Barra fija abajo, solo en el celular: aparece al pasar la portada y se
// esconde cuando se ve el cierre (que ya tiene los mismos botones). La muestra
// y la esconde LandingEffects con data-visible. En el celular el menu de arriba
// no entra, asi que el siguiente paso queda siempre a mano.
export function CtaMovil() {
  return (
    <div
      id="cta-movil"
      data-visible="false"
      className="fixed inset-x-0 bottom-0 z-40 translate-y-full border-t border-white/[0.08] bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-transform duration-300 data-[visible=true]:translate-y-0 sm:hidden"
    >
      <div className="flex gap-2">
        <Link
          href={ROUTES.demo}
          prefetch={false}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 text-sm font-semibold text-slate-200"
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Ver demo
        </Link>
        <Link
          href={ROUTES.signup}
          prefetch={false}
          className="inline-flex min-h-11 flex-[1.4] items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(59,139,255,0.65)]"
        >
          Probar gratis {TRIAL_DAYS} días
        </Link>
      </div>
    </div>
  )
}
