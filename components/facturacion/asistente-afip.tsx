"use client";

// components/facturacion/asistente-afip.tsx — tutorial paso a paso para que el
// comerciante active la facturacion electronica solo. Una pantalla por paso,
// barra de progreso, lo de ARCA como lista para tildar y, si la prueba falla,
// el error explicado con un boton al paso donde se arregla.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Globe, MessageCircle, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONTACT } from "@/lib/marketing/contact";
import { trackWhatsAppClick } from "@/lib/analytics";
import type { PasoTutorial } from "@/lib/afip/explicar-error";
import type { EstadoConfigAfip } from "@/services/facturacion-service";
import { PasoAmbiente, PasoDatos, PasoPedido, type Ambiente } from "./tutorial/pasos-sistema";
import { PasoAutorizar, PasoCertificado, PasoProbar, PasoPuntoVenta, TAREAS_AUTORIZAR } from "./tutorial/pasos-arca";
import { useTildes } from "./tutorial/tareas-arca";

interface DefPaso {
  id: PasoTutorial;
  titulo: string;
  bajada: string;
  enArca: boolean;
}

const PASOS: DefPaso[] = [
  { id: "ambiente", titulo: "¿Probar o facturar de verdad?", bajada: "Elegí cómo arrancar. Lo podés cambiar después.", enArca: false },
  { id: "datos", titulo: "Tus datos fiscales", bajada: "Los que van impresos en cada factura.", enArca: false },
  { id: "pedido", titulo: "Pedido de certificado", bajada: "Lo generamos nosotros con un clic.", enArca: false },
  { id: "certificado", titulo: "Sacar el certificado", bajada: "En la web de ARCA, con tu clave fiscal.", enArca: true },
  { id: "autorizar", titulo: "Autorizar la facturación", bajada: "En ARCA: darle permiso al certificado.", enArca: true },
  { id: "punto-venta", titulo: "Punto de venta", bajada: "El número que va en tus facturas.", enArca: true },
  { id: "probar", titulo: "Probar y activar", bajada: "Comprobamos que todo funcione.", enArca: false },
];

export function AsistenteAfip({ estado, onEstado }: { estado: EstadoConfigAfip; onEstado: (e: EstadoConfigAfip) => void }) {
  const [ambiente, setAmbiente] = useState<Ambiente>(estado.ambiente ?? "homologacion");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [tildesCert, alternarCert] = useTildes(`certificado-${ambiente}`);
  const [tildesAut, alternarAut] = useTildes(`autorizar-${ambiente}`);
  const [tildesPv, alternarPv] = useTildes(`punto-venta-${ambiente}`);

  const listo: Record<PasoTutorial, boolean> = {
    ambiente: estado.configurado,
    datos: estado.configurado,
    pedido: !!estado.tienePedido,
    certificado: !!estado.tieneCertificado,
    autorizar: !!estado.activo || TAREAS_AUTORIZAR[ambiente].every((t) => tildesAut[t.id]),
    "punto-venta": !!estado.puntoVenta && estado.ambiente === ambiente,
    probar: !!estado.activo,
  };

  // Arranca en el primer paso sin hacer (retoma donde quedo); todo hecho = el final ("¡Listo!").
  const pasoInicial = useMemo(() => {
    const i = PASOS.findIndex((p) => !listo[p.id]);
    return i === -1 ? PASOS.length - 1 : i;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [indice, setIndice] = useState(pasoInicial);
  const paso = PASOS[indice];
  const hechos = PASOS.filter((p) => listo[p.id]).length;

  const correr = async (clave: string, fn: () => Promise<EstadoConfigAfip>, exito: string): Promise<boolean> => {
    setOcupado(clave);
    try {
      onEstado(await fn());
      toast.success(exito);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const irA = (id: PasoTutorial) => setIndice(PASOS.findIndex((p) => p.id === id));
  // Los pasos que guardan algo en el sistema hay que completarlos para seguir.
  const bloqueaSiguiente = ["datos", "pedido", "certificado", "punto-venta"].includes(paso.id) && !listo[paso.id];
  const props = { estado, ambiente, correr, ocupado };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Progreso */}
      <div className="card-premium rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Paso {indice + 1} de {PASOS.length}</span>
          <span>{hechos} de {PASOS.length} listos</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="grad-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${(hechos / PASOS.length) * 100}%` }} />
        </div>
        <ol className="mt-3 flex flex-wrap gap-1.5">
          {PASOS.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setIndice(i)}
                aria-current={i === indice ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors",
                  i === indice ? "border-primary bg-primary text-primary-foreground" : listo[p.id] ? "border-success/40 text-success" : "text-muted-foreground hover:border-primary/50",
                )}
              >
                {listo[p.id] && i !== indice ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{p.titulo}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* Paso actual */}
      <section className="card-premium rounded-2xl p-5 sm:p-6" aria-labelledby="titulo-paso">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="titulo-paso" className="text-xl font-bold tracking-tight">{indice + 1}. {paso.titulo}</h2>
            <p className="text-sm text-muted-foreground">{paso.bajada}</p>
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", paso.enArca ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary")}>
            {paso.enArca ? <Globe className="h-3.5 w-3.5" /> : <MonitorSmartphone className="h-3.5 w-3.5" />}
            {paso.enArca ? "Se hace en la web de ARCA" : "Se hace acá"}
          </span>
        </div>

        {paso.id === "ambiente" && <PasoAmbiente ambiente={ambiente} setAmbiente={setAmbiente} tieneCertificado={!!estado.tieneCertificado} />}
        {paso.id === "datos" && <PasoDatos {...props} />}
        {paso.id === "pedido" && <PasoPedido {...props} />}
        {paso.id === "certificado" && <PasoCertificado {...props} hechas={tildesCert} onAlternar={alternarCert} />}
        {paso.id === "autorizar" && <PasoAutorizar ambiente={ambiente} hechas={tildesAut} onAlternar={alternarAut} />}
        {paso.id === "punto-venta" && <PasoPuntoVenta {...props} hechas={tildesPv} onAlternar={alternarPv} />}
        {paso.id === "probar" && <PasoProbar {...props} irA={irA} />}

        <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" className="rounded-xl" disabled={indice === 0} onClick={() => setIndice(indice - 1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Anterior
          </Button>
          {indice < PASOS.length - 1 && (
            <Button className="rounded-xl" disabled={bloqueaSiguiente} onClick={() => setIndice(indice + 1)}
              title={bloqueaSiguiente ? "Completá este paso para seguir" : undefined}>
              Siguiente <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        ¿Te trabaste en algún paso?{" "}
        <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => trackWhatsAppClick("asistente-afip", { conversion: false })}>
          <MessageCircle className="h-3.5 w-3.5" /> Escribinos por WhatsApp
        </a>
        {" "}y te ayudamos a terminarlo.
      </p>
    </div>
  );
}
