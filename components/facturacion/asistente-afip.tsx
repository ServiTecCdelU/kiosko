"use client";

// components/facturacion/asistente-afip.tsx — alta de la facturacion electronica
// en 5 pasos: datos fiscales, pedido de certificado, certificado, punto de venta
// y modo, prueba y activacion. Spec: 2026-10-03-facturacion-afip-design.md
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, FileKey2, Loader2, PlugZap, Power, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { InstruccionesCertificado, InstruccionesPuntoVenta } from "@/components/facturacion/instrucciones-afip";
import {
  descargarPedidoCertificado, desactivarAfip, generarPedidoCertificado, guardarDatosFiscales, guardarOperacionAfip,
  probarAfip, subirCertificadoAfip, type EstadoConfigAfip, type PasoPrueba,
} from "@/services/facturacion-service";

type Ambiente = "homologacion" | "produccion";

function Paso({ n, titulo, listo, children }: { n: number; titulo: string; listo: boolean; children: React.ReactNode }) {
  return (
    <section className="card-premium rounded-2xl p-5" aria-labelledby={`paso-${n}`}>
      <h2 id={`paso-${n}`} className="mb-3 flex items-center gap-2 font-semibold">
        {listo ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
        {n}. {titulo}
      </h2>
      {children}
    </section>
  );
}

function useAccion(onEstado: (e: EstadoConfigAfip) => void) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const correr = async (clave: string, fn: () => Promise<EstadoConfigAfip>, exito: string) => {
    setOcupado(clave);
    try {
      onEstado(await fn());
      toast.success(exito);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(null);
    }
  };
  return { ocupado, correr };
}

export function AsistenteAfip({ estado, onEstado }: { estado: EstadoConfigAfip; onEstado: (e: EstadoConfigAfip) => void }) {
  const { ocupado, correr } = useAccion(onEstado);
  const ambiente: Ambiente = estado.ambiente ?? "homologacion";

  // Paso 1
  const [cuit, setCuit] = useState(estado.cuit ?? "");
  const [razonSocial, setRazonSocial] = useState(estado.razonSocial ?? "");
  const [domicilio, setDomicilio] = useState(estado.domicilio ?? "");
  const [inicio, setInicio] = useState(estado.inicioActividades ?? "");
  const [iibb, setIibb] = useState(estado.ingresosBrutos ?? "");
  // Paso 3
  const [certificado, setCertificado] = useState("");
  // Paso 4
  const [puntoVenta, setPuntoVenta] = useState(String(estado.puntoVenta ?? ""));
  const [ambienteSel, setAmbienteSel] = useState<Ambiente>(ambiente);
  const [modo, setModo] = useState<"manual" | "automatico">(estado.modo ?? "manual");
  // Paso 5
  const [prueba, setPrueba] = useState<PasoPrueba[] | null>(null);

  const leerArchivo = async (archivo: File | undefined) => {
    if (archivo) setCertificado(await archivo.text());
  };

  const probar = async (activar: boolean) => {
    setPrueba(null);
    await correr(activar ? "activar" : "probar", async () => {
      const r = await probarAfip(activar);
      setPrueba(r.pasos);
      if (!r.ok) throw new Error("La prueba falló: revisá el detalle");
      return r.estado;
    }, activar ? "Facturación electrónica activada" : "Conexión con AFIP OK");
  };

  const datosListos = estado.configurado;
  const pedidoListo = !!estado.tienePedido;
  const certListo = !!estado.tieneCertificado;
  const operacionLista = !!estado.puntoVenta;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Paso n={1} titulo="Datos fiscales" listo={datosListos}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            correr("datos", () => guardarDatosFiscales({ cuit, razonSocial, domicilio, inicioActividades: inicio, ingresosBrutos: iibb }), "Datos fiscales guardados");
          }}
        >
          <div className="space-y-1"><Label htmlFor="cuit">CUIT</Label><Input id="cuit" value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="20-12345678-6" inputMode="numeric" className="rounded-xl" /></div>
          <div className="space-y-1"><Label htmlFor="razon">Razón social (como en AFIP)</Label><Input id="razon" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="domicilio">Domicilio comercial</Label><Input id="domicilio" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-1"><Label htmlFor="inicio">Inicio de actividades</Label><Input id="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="rounded-xl" /></div>
          <div className="space-y-1"><Label htmlFor="iibb">Ingresos Brutos (opcional)</Label><Input id="iibb" value={iibb} onChange={(e) => setIibb(e.target.value)} className="rounded-xl" /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Condición: Responsable Monotributo (emite Factura C). Si cambiás el CUIT, hay que generar un pedido de certificado nuevo.</p>
          <Button type="submit" className="rounded-xl sm:col-span-2 sm:w-fit" disabled={ocupado === "datos"}>
            {ocupado === "datos" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar datos
          </Button>
        </form>
      </Paso>

      <Paso n={2} titulo="Pedido de certificado" listo={pedidoListo}>
        <p className="mb-3 text-sm text-muted-foreground">
          El sistema genera tu clave privada (queda guardada y cifrada acá, nunca la ves ni la descargás) y el pedido de certificado para AFIP.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={pedidoListo ? "outline" : "default"}
            className="rounded-xl"
            disabled={!datosListos || ocupado === "pedido"}
            onClick={() => correr("pedido", generarPedidoCertificado, "Pedido generado: descargalo y subilo en AFIP")}
          >
            {ocupado === "pedido" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileKey2 className="mr-2 h-4 w-4" />}
            {pedidoListo ? "Generar uno nuevo" : "Generar pedido"}
          </Button>
          {pedidoListo && (
            <Button variant="outline" className="rounded-xl" onClick={() => descargarPedidoCertificado().catch((e) => toast.error(e.message))}>
              <Download className="mr-2 h-4 w-4" /> Descargar .csr
            </Button>
          )}
        </div>
        {pedidoListo && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Qué hacer en AFIP/ARCA ({ambiente === "homologacion" ? "pruebas" : "producción"}):</p>
            <InstruccionesCertificado ambiente={ambiente} />
            {pedidoListo && certListo && <p className="text-xs text-warning">Generar uno nuevo invalida el certificado actual.</p>}
          </div>
        )}
      </Paso>

      <Paso n={3} titulo="Certificado de AFIP" listo={certListo}>
        {certListo && <p className="mb-2 text-sm text-success">Certificado cargado · vence el {formatDate(estado.certVence)}</p>}
        <div className="space-y-2">
          <Input type="file" accept=".crt,.pem,.cer,text/plain" onChange={(e) => leerArchivo(e.target.files?.[0])} className="rounded-xl" disabled={!pedidoListo} />
          <textarea
            value={certificado}
            onChange={(e) => setCertificado(e.target.value)}
            placeholder="…o pegá acá el certificado (-----BEGIN CERTIFICATE-----)"
            rows={4}
            disabled={!pedidoListo}
            className="w-full rounded-xl border bg-transparent p-2 font-mono text-xs"
          />
          <Button
            className="rounded-xl"
            disabled={!pedidoListo || !certificado.trim() || ocupado === "cert"}
            onClick={() => correr("cert", () => subirCertificadoAfip(certificado), "Certificado guardado").then(() => setCertificado(""))}
          >
            {ocupado === "cert" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar certificado
          </Button>
        </div>
      </Paso>

      <Paso n={4} titulo="Punto de venta y modo" listo={operacionLista}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ambiente">Ambiente</Label>
            <select id="ambiente" value={ambienteSel} onChange={(e) => setAmbienteSel(e.target.value as Ambiente)} className="h-9 w-full rounded-xl border bg-transparent px-2 text-sm">
              <option value="homologacion">Homologación (pruebas)</option>
              <option value="produccion">Producción (facturas reales)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pv">Punto de venta</Label>
            <Input id="pv" value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value)} inputMode="numeric" className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="modo">Cuándo facturar</Label>
            <select id="modo" value={modo} onChange={(e) => setModo(e.target.value as "manual" | "automatico")} className="h-9 w-full rounded-xl border bg-transparent px-2 text-sm">
              <option value="manual">Cuando lo pida (botón Facturar)</option>
              <option value="automatico">Todas las ventas, solas</option>
            </select>
          </div>
        </div>
        <div className="mt-2"><InstruccionesPuntoVenta ambiente={ambienteSel} /></div>
        {ambienteSel !== ambiente && certListo && (
          <p className="mt-2 text-xs text-warning">Cada ambiente usa su propio certificado: al cambiarlo vas a tener que cargar el certificado de {ambienteSel === "produccion" ? "producción" : "homologación"}.</p>
        )}
        <Button
          className="mt-3 rounded-xl"
          disabled={!datosListos || ocupado === "operacion"}
          onClick={() => correr("operacion", () => guardarOperacionAfip({ puntoVenta, ambiente: ambienteSel, modo }), "Guardado")}
        >
          {ocupado === "operacion" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
        </Button>
      </Paso>

      <Paso n={5} titulo="Probar y activar" listo={!!estado.activo}>
        {estado.activo ? (
          <p className="mb-3 text-sm text-success">
            Facturación activa en {estado.ambiente === "produccion" ? "producción" : "homologación (pruebas, sin validez fiscal)"} ·{" "}
            {estado.modo === "automatico" ? "todas las ventas se facturan solas" : "se factura con el botón Facturar"}.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">Probá la conexión con AFIP. Si todo da bien, activá la facturación.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" disabled={!certListo || !operacionLista || !!ocupado} onClick={() => probar(false)}>
            {ocupado === "probar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />} Probar conexión
          </Button>
          {!estado.activo ? (
            <Button className="rounded-xl" disabled={!certListo || !operacionLista || !!ocupado} onClick={() => probar(true)}>
              {ocupado === "activar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />} Probar y activar
            </Button>
          ) : (
            <Button variant="ghost" className="rounded-xl text-muted-foreground" disabled={!!ocupado} onClick={() => correr("desactivar", desactivarAfip, "Facturación desactivada")}>
              Desactivar
            </Button>
          )}
        </div>
        {prueba && (
          <ul className="mt-3 space-y-1 text-sm">
            {prueba.map((p, i) => (
              <li key={i} className={cn("flex items-start gap-2", p.ok ? "text-foreground" : "text-destructive")}>
                {p.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span><b>{p.paso}:</b> {p.detalle}</span>
              </li>
            ))}
          </ul>
        )}
      </Paso>
    </div>
  );
}
