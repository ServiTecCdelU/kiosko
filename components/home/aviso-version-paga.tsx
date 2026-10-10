"use client";

// components/home/aviso-version-paga.tsx — en la demo publica, en lugar de los
// formularios de Mercado Pago y facturacion AFIP (que piden credenciales reales),
// se muestra que esas funciones vienen en la version paga.
import { Lock, MessageCircle, type LucideIcon } from "lucide-react";
import { CONTACT } from "@/lib/marketing/contact";
import { trackWhatsAppClick } from "@/lib/analytics";
import { DEMO_SLUG } from "@/lib/demo";
import { useAuth } from "@/hooks/use-auth";

/** true si la sesion es la de la demo publica. */
export function useEsDemo(): boolean {
  const { user } = useAuth();
  return user?.comercioSlug === DEMO_SLUG;
}

interface AvisoVersionPagaProps {
  id?: string;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
}

export function AvisoVersionPaga({ id, icono: Icono, titulo, descripcion }: AvisoVersionPagaProps) {
  return (
    <section id={id} className="card-premium scroll-mt-6 rounded-2xl p-5" aria-labelledby={id ? `${id}-titulo` : undefined}>
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icono className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={id ? `${id}-titulo` : undefined} className="font-semibold text-foreground">{titulo}</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary">
              <Lock className="h-3 w-3" /> Versión paga
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Mercado Pago (QR y lector Point) y la facturación electrónica AFIP/ARCA están disponibles en la versión paga.
          </p>
          <a
            href={CONTACT.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            onClick={() => trackWhatsAppClick("demo-version-paga")}
          >
            <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
