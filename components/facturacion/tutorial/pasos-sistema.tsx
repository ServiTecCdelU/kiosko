"use client";

// components/facturacion/tutorial/pasos-sistema.tsx — los pasos que se hacen en
// este sistema: elegir pruebas o reales, datos fiscales y pedido de certificado.
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, FileKey2, FlaskConical, Loader2, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  descargarPedidoCertificado, generarPedidoCertificado, guardarDatosFiscales, textoPedidoCertificado,
  type EstadoConfigAfip,
} from "@/services/facturacion-service";

export type Ambiente = "homologacion" | "produccion";

export interface PropsPaso {
  estado: EstadoConfigAfip;
  ambiente: Ambiente;
  /** Corre una accion contra el servidor y actualiza el estado. true = salio bien. */
  correr: (clave: string, fn: () => Promise<EstadoConfigAfip>, exito: string) => Promise<boolean>;
  ocupado: string | null;
}

export function PasoAmbiente({ ambiente, setAmbiente, tieneCertificado }: { ambiente: Ambiente; setAmbiente: (a: Ambiente) => void; tieneCertificado: boolean }) {
  const opcion = (valor: Ambiente, icono: React.ReactNode, titulo: string, texto: string, recomendado?: boolean) => (
    <button
      type="button"
      onClick={() => setAmbiente(valor)}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
        ambiente === valor ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ambiente === valor ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {icono}
      </span>
      <span>
        <span className="block font-semibold">
          {titulo} {recomendado && <span className="ml-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">recomendado la 1ª vez</span>}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{texto}</span>
      </span>
    </button>
  );
  return (
    <div className="space-y-3">
      {opcion("homologacion", <FlaskConical className="h-5 w-5" />, "Primero probar", "Facturas de prueba, sin validez fiscal. Sirve para ver que todo ande antes de facturar de verdad.", true)}
      {opcion("produccion", <ReceiptText className="h-5 w-5" />, "Facturar de verdad", "Facturas reales, que valen ante ARCA. Elegí esta si ya probaste o si te ayuda tu contador.")}
      {tieneCertificado && (
        <p className="text-xs text-warning">Ojo: cada opción usa su propio certificado. Si cambiás, vas a tener que sacar el certificado de nuevo.</p>
      )}
    </div>
  );
}

export function PasoDatos({ estado, correr, ocupado }: PropsPaso) {
  const [cuit, setCuit] = useState(estado.cuit ?? "");
  const [razonSocial, setRazonSocial] = useState(estado.razonSocial ?? "");
  const [domicilio, setDomicilio] = useState(estado.domicilio ?? "");
  const [inicio, setInicio] = useState(estado.inicioActividades ?? "");
  const [iibb, setIibb] = useState(estado.ingresosBrutos ?? "");
  const [condicion, setCondicion] = useState<"monotributo" | "responsable_inscripto">(estado.condicionIva ?? "monotributo");

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        correr("datos", () => guardarDatosFiscales({ cuit, razonSocial, domicilio, inicioActividades: inicio, ingresosBrutos: iibb, condicionIva: condicion }), "Datos guardados");
      }}
    >
      <div className="space-y-2 sm:col-span-2">
        <Label>Tu condición frente al IVA</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["monotributo", "Monotributista", "Emitís Factura C a todos tus clientes."],
            ["responsable_inscripto", "Responsable inscripto", "Emitís Factura B al público y Factura A a otros inscriptos, con el IVA de cada producto discriminado."],
          ] as const).map(([valor, titulo, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setCondicion(valor)}
              className={cn(
                "rounded-2xl border-2 p-3 text-left transition-colors",
                condicion === valor ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              )}
            >
              <span className="block font-semibold">{titulo}</span>
              <span className="block text-xs text-muted-foreground">{texto}</span>
            </button>
          ))}
        </div>
        {condicion === "responsable_inscripto" && (
          <p className="text-xs text-warning">Revisá que cada producto tenga su alícuota de IVA (Stock → Editar producto). Por defecto es 21 %.</p>
        )}
      </div>
      <div className="space-y-1"><Label htmlFor="cuit">Tu CUIT</Label><Input id="cuit" value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="20-12345678-6" inputMode="numeric" className="rounded-xl" /></div>
      <div className="space-y-1"><Label htmlFor="razon">Nombre o razón social</Label><Input id="razon" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="Como figura en ARCA" className="rounded-xl" /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="domicilio">Domicilio del comercio</Label><Input id="domicilio" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="Calle, número, ciudad" className="rounded-xl" /></div>
      <div className="space-y-1"><Label htmlFor="inicio">Inicio de actividades</Label><Input id="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="rounded-xl" /></div>
      <div className="space-y-1"><Label htmlFor="iibb">Ingresos Brutos (si tenés)</Label><Input id="iibb" value={iibb} onChange={(e) => setIibb(e.target.value)} className="rounded-xl" /></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Estos datos salen impresos en cada factura. Si no sabés la fecha de inicio, está en tu constancia de inscripción de ARCA.
      </p>
      <Button type="submit" className="rounded-xl sm:col-span-2 sm:w-fit" disabled={ocupado === "datos"}>
        {ocupado === "datos" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar mis datos
      </Button>
    </form>
  );
}

export function PasoPedido({ estado, ambiente, correr, ocupado }: PropsPaso) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(await textoPedidoCertificado());
      toast.success("Pedido copiado: pegalo en ARCA");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo copiar");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Para facturar, ARCA te da un <b>certificado</b> (como una llave digital de tu comercio). Para pedirlo hace falta un
        <b> archivo de pedido</b>, y lo generamos nosotros: vos solo lo descargás y lo subís en ARCA en el paso siguiente.
      </p>
      {!estado.tienePedido ? (
        <Button className="h-11 rounded-xl" disabled={ocupado === "pedido"} onClick={() => correr("pedido", generarPedidoCertificado, "Pedido listo")}>
          {ocupado === "pedido" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileKey2 className="mr-2 h-4 w-4" />}
          Generar mi pedido
        </Button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-success/40 bg-success/5 p-4">
          <p className="text-sm font-medium text-success">Tu pedido está listo.</p>
          <div className="flex flex-wrap gap-2">
            {ambiente === "produccion" ? (
              <Button className="rounded-xl" onClick={() => descargarPedidoCertificado().catch((e) => toast.error(e.message))}>
                <Download className="mr-2 h-4 w-4" /> Descargar el pedido (.csr)
              </Button>
            ) : (
              <Button className="rounded-xl" onClick={copiar}>
                <Copy className="mr-2 h-4 w-4" /> Copiar el pedido
              </Button>
            )}
            <Button variant="ghost" className="rounded-xl text-muted-foreground" disabled={ocupado === "pedido"}
              onClick={() => correr("pedido", generarPedidoCertificado, "Pedido nuevo generado")}>
              Generar uno nuevo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {ambiente === "produccion"
              ? "Guardalo en un lugar fácil de encontrar (por ejemplo el Escritorio): lo vas a subir en ARCA."
              : "En el modo prueba, ARCA te pide pegar el texto del pedido: con este botón queda copiado."}
            {estado.tieneCertificado && " Generar uno nuevo anula el certificado que ya subiste."}
          </p>
        </div>
      )}
    </div>
  );
}
