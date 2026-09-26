"use client";
// components/stock/oferta-publicada.tsx — segundo paso del estudio de ofertas:
// la oferta ya se cobra en el POS, ahora hay que contarla (cartel + WhatsApp).
import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartelOferta } from "@/components/stock/cartel-oferta";
import { textoCompartirOferta } from "@/lib/oferta-analisis";
import type { Product } from "@/lib/types";

const COMERCIO_KEY = "kiosko:cartel-comercio";

/** Nombre del negocio que se imprime en el cartel y va al pie del WhatsApp (por navegador). */
export function useNombreComercio(): [string, (v: string) => void] {
  const [nombre, setNombre] = useState("");
  useEffect(() => {
    try {
      setNombre(localStorage.getItem(COMERCIO_KEY) ?? "");
    } catch {
      // sin storage (modo privado): el cartel sale sin nombre
    }
  }, []);
  const guardar = (v: string) => {
    setNombre(v);
    try {
      localStorage.setItem(COMERCIO_KEY, v);
    } catch {
      // idem
    }
  };
  return [nombre, guardar];
}

interface OfertaPublicadaProps {
  producto: Product;
  onImprimirCartel?: (producto: Product, comercio: string) => void;
  onListo: () => void;
}

export function OfertaPublicada({ producto, onImprimirCartel, onListo }: OfertaPublicadaProps) {
  const [comercio, setComercio] = useNombreComercio();
  const [copiado, setCopiado] = useState(false);
  const texto = textoCompartirOferta(producto, comercio.trim() || undefined);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Probá con el botón de WhatsApp.");
    }
  };

  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300">
      <div className="mb-4 flex flex-col items-center text-center">
        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-money text-money-foreground shadow-lg shadow-money/30">
          <Check className="h-6 w-6" strokeWidth={3} />
        </span>
        <p className="text-lg font-bold">¡Oferta publicada!</p>
        <p className="text-sm text-muted-foreground">Ya se cobra así en el POS. Ahora contale a tus clientes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
        <div className="mx-auto rounded-2xl bg-muted/60 p-3">
          <CartelOferta producto={producto} comercio={comercio.trim()} style={{ fontSize: "5.6px" }} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre del negocio</label>
            <Input
              value={comercio}
              onChange={(e) => setComercio(e.target.value)}
              placeholder="Ej: Despensa Don José"
              className="rounded-xl"
              maxLength={40}
            />
            <p className="mt-1 text-xs text-muted-foreground">Sale en el cartel y al pie del mensaje.</p>
          </div>

          {onImprimirCartel && (
            <Button className="h-11 w-full rounded-xl" onClick={() => onImprimirCartel(producto, comercio.trim())}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir cartel A4
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 w-full rounded-xl border-[#25d366]/50 text-[#128c4a] hover:bg-[#25d366]/10 dark:text-[#25d366]"
            onClick={whatsapp}
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Compartir por WhatsApp
          </Button>
          <Button variant="ghost" className="w-full rounded-xl" onClick={copiar}>
            {copiado ? <Check className="mr-2 h-4 w-4 text-money" /> : <Copy className="mr-2 h-4 w-4" />}
            {copiado ? "¡Copiado!" : "Copiar texto de la oferta"}
          </Button>

          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 font-sans text-xs text-muted-foreground">
            {texto}
          </pre>

          <Button variant="secondary" className="w-full rounded-xl" onClick={onListo}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}
