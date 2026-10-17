"use client";
// components/layout/aviso-demo.tsx — franja fija en la demo publica: la gente
// entra a mirar y no se registra, asi que el paso siguiente queda siempre a
// mano (crear su comercio en prueba, o escribir por WhatsApp).
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { useEsDemo } from "@/components/home/aviso-version-paga";
import { WhatsAppLink } from "@/components/analytics/whatsapp-link";
import { ROUTES, TRIAL_DAYS } from "@/lib/marketing/contact";
import { trackEvent } from "@/lib/analytics";

export function AvisoDemo() {
  const esDemo = useEsDemo();
  // La sesion vive en sessionStorage: se muestra recien al montar (sin desfasar el render del server).
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado || !esDemo) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-primary/10 px-4 py-2 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        Estás en la demo, con datos de ejemplo. ¿Te gusta? Armá el tuyo: {TRIAL_DAYS} días gratis, sin tarjeta.
      </span>
      <span className="flex items-center gap-2">
        <WhatsAppLink
          ubicacion="demo-franja"
          mensaje="Hola, estuve mirando la demo y quiero consultar"
          className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-background px-3 py-1 text-xs font-semibold transition-colors hover:bg-primary/10"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Consultar
        </WhatsAppLink>
        <Link
          href={ROUTES.signup}
          onClick={() => trackEvent("demo_crear_comercio")}
          className="rounded-xl bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Crear mi comercio gratis
        </Link>
      </span>
    </div>
  );
}
