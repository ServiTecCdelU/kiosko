"use client";

// components/analytics/whatsapp-link.tsx — link al WhatsApp de ServiTec que
// registra el click (GA4 + conversion de Ads). Existe porque la landing son
// componentes de servidor y no pueden tener onClick. `ubicacion` identifica
// desde donde se hizo click (hero, footer, cierre...).
import type { AnchorHTMLAttributes } from "react";
import { CONTACT } from "@/lib/marketing/contact";
import { trackWhatsAppClick } from "@/lib/analytics";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  ubicacion: string;
  /** Texto con el que se abre el chat (soporte desde adentro de la app). */
  mensaje?: string;
  /** false = click de soporte de un cliente que ya paga, no cuenta como conversion de Ads. */
  conversion?: boolean;
};

export function WhatsAppLink({ ubicacion, mensaje, conversion, children, ...props }: Props) {
  const href = mensaje ? `${CONTACT.whatsappUrl}?text=${encodeURIComponent(mensaje)}` : CONTACT.whatsappUrl;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsAppClick(ubicacion, { conversion })} {...props}>
      {children}
    </a>
  );
}
