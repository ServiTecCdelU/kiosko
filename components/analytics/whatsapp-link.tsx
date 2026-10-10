"use client";

// components/analytics/whatsapp-link.tsx — link al WhatsApp de ServiTec que
// registra el click (GA4 + conversion de Ads). Existe porque la landing son
// componentes de servidor y no pueden tener onClick. `ubicacion` identifica
// desde donde se hizo click (hero, footer, cierre...).
import type { AnchorHTMLAttributes } from "react";
import { CONTACT } from "@/lib/marketing/contact";
import { trackWhatsAppClick } from "@/lib/analytics";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & { ubicacion: string };

export function WhatsAppLink({ ubicacion, children, ...props }: Props) {
  return (
    <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsAppClick(ubicacion)} {...props}>
      {children}
    </a>
  );
}
