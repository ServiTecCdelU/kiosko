"use client";

// components/facturacion/tutorial/pasos-arca.tsx — los pasos que se hacen en la
// web de ARCA (con la clave fiscal del comerciante) y la prueba final.
// Las instrucciones cambian segun pruebas (homologacion) o reales (produccion).
import { useState } from "react";
import { CheckCircle2, Loader2, PartyPopper, PlugZap, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { explicarErrorAfip, type PasoTutorial } from "@/lib/afip/explicar-error";
import {
  emitirPruebaAfip, guardarOperacionAfip, probarAfip, subirCertificadoAfip, type PasoPrueba,
} from "@/services/facturacion-service";
import { BotonArca, TareasArca, type Tarea } from "./tareas-arca";
import type { PropsPaso } from "./pasos-sistema";

const AYUDA_SERVICIO = (servicio: string) => (
  <>
    En ARCA entrá a <b>“Administrador de Relaciones de Clave Fiscal”</b> → <b>“Adherir servicio”</b> → buscá
    <b> ARCA</b> → <b>“{servicio}”</b> → Confirmar. Salí y volvé a entrar a ARCA: ya te aparece.
  </>
);

export const TAREAS_CERTIFICADO: Record<"homologacion" | "produccion", Tarea[]> = {
  produccion: [
    { id: "entrar", texto: <>Entrá a ARCA con tu <b>CUIT y clave fiscal</b>.</> },
    { id: "servicio", texto: <>Abrí el servicio <b>“Administración de Certificados Digitales”</b>.</>, ayuda: AYUDA_SERVICIO("Administración de Certificados Digitales") },
    { id: "alias", texto: <>Elegí tu CUIT y tocá <b>“Agregar alias”</b>. Poné un nombre (por ejemplo el de tu comercio) y en “Archivo” subí el <b>pedido (.csr)</b> que descargaste.</> },
    { id: "descargar", texto: <>Tocá el alias que creaste y <b>descargá el certificado</b>. Es un archivo que termina en <b>.crt</b>.</> },
    { id: "subir", texto: <>Subilo acá abajo.</> },
  ],
  homologacion: [
    { id: "entrar", texto: <>Entrá a ARCA con tu <b>CUIT y clave fiscal</b>.</> },
    { id: "servicio", texto: <>Abrí el servicio <b>“WSASS - Autogestión Certificados Homologación”</b>.</>, ayuda: AYUDA_SERVICIO("WSASS - Autogestión Certificados Homologación") },
    { id: "alias", texto: <>Tocá <b>“Nuevo Certificado”</b>, poné un nombre y en el recuadro grande <b>pegá el pedido</b> (lo copiaste en el paso anterior). Tocá “Crear DN y obtener certificado”.</> },
    { id: "descargar", texto: <><b>Copiá el certificado</b> que aparece (todo, desde <i>-----BEGIN CERTIFICATE-----</i> hasta el final).</> },
    { id: "subir", texto: <>Pegalo acá abajo.</> },
  ],
};

export const TAREAS_AUTORIZAR: Record<"homologacion" | "produccion", Tarea[]> = {
  produccion: [
    { id: "relaciones", texto: <>En ARCA, abrí <b>“Administrador de Relaciones de Clave Fiscal”</b>.</> },
    { id: "nueva", texto: <>Tocá <b>“Nueva Relación”</b> → <b>“Buscar”</b> → <b>ARCA</b> → <b>WebServices</b> → <b>“Facturación Electrónica”</b>.</> },
    { id: "representante", texto: <>En <b>“Representante”</b> tocá “Buscar” y elegí el <b>alias</b> que creaste con el certificado. Tocá <b>“Confirmar”</b>.</>,
      ayuda: <>Si el alias no aparece en la lista, esperá unos minutos: a ARCA a veces le tarda en verlo.</> },
  ],
  homologacion: [
    { id: "autorizacion", texto: <>En el mismo servicio <b>WSASS</b>, tocá <b>“Crear autorización a servicio”</b>.</> },
    { id: "elegir", texto: <>Elegí el certificado que creaste y en servicio elegí <b>“wsfe - Facturación Electrónica”</b>. Tocá “Crear autorización”.</> },
  ],
};

export const TAREAS_PUNTO_VENTA: Tarea[] = [
  { id: "abm", texto: <>En ARCA, abrí <b>“Administración de puntos de venta y domicilios”</b>.</>, ayuda: AYUDA_SERVICIO("Administración de puntos de venta y domicilios") },
  { id: "agregar", texto: <>Tocá <b>“Agregar”</b>. Poné un <b>número nuevo</b> (que no uses en otro sistema), en sistema elegí <b>“Factura Electrónica - Monotributo - Web Services”</b> (si sos monotributista) o <b>“Factura Electrónica - Web Services”</b> (si sos responsable inscripto) y el domicilio de tu comercio.</> },
  { id: "cargar", texto: <>Cargá ese número acá abajo.</> },
];

export function PasoCertificado({ estado, ambiente, correr, ocupado, hechas, onAlternar }: PropsPaso & { hechas: Record<string, boolean>; onAlternar: (id: string) => void }) {
  const [certificado, setCertificado] = useState("");
  return (
    <div className="space-y-4">
      <BotonArca />
      <TareasArca tareas={TAREAS_CERTIFICADO[ambiente]} hechas={hechas} onAlternar={onAlternar} />
      {estado.tieneCertificado && (
        <p className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Certificado cargado · vence el {formatDate(estado.certVence)}</p>
      )}
      <div className="space-y-2 rounded-2xl border p-3">
        {ambiente === "produccion" && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed p-3 text-sm hover:border-primary">
            <Upload className="h-4 w-4 text-primary" /> Elegir el archivo .crt
            <input type="file" accept=".crt,.pem,.cer,text/plain" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCertificado(await f.text()); }} />
          </label>
        )}
        <textarea
          value={certificado}
          onChange={(e) => setCertificado(e.target.value)}
          placeholder={ambiente === "produccion" ? "…o pegá acá el contenido del certificado" : "Pegá acá el certificado (-----BEGIN CERTIFICATE-----…)"}
          rows={4}
          className="w-full rounded-xl border bg-transparent p-2 font-mono text-xs"
        />
        <Button className="rounded-xl" disabled={!certificado.trim() || ocupado === "cert"}
          onClick={async () => { if (await correr("cert", () => subirCertificadoAfip(certificado), "Certificado guardado")) setCertificado(""); }}>
          {ocupado === "cert" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar certificado
        </Button>
      </div>
    </div>
  );
}

export function PasoAutorizar({ ambiente, hechas, onAlternar }: { ambiente: "homologacion" | "produccion"; hechas: Record<string, boolean>; onAlternar: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ahora hay que darle permiso a tu certificado para <b>facturar</b>. Es el paso que más se olvida: sin él, ARCA no deja emitir.
      </p>
      <BotonArca />
      <TareasArca tareas={TAREAS_AUTORIZAR[ambiente]} hechas={hechas} onAlternar={onAlternar} />
    </div>
  );
}

export function PasoPuntoVenta({ estado, ambiente, correr, ocupado, hechas, onAlternar }: PropsPaso & { hechas: Record<string, boolean>; onAlternar: (id: string) => void }) {
  const [puntoVenta, setPuntoVenta] = useState(String(estado.puntoVenta ?? (ambiente === "homologacion" ? "1" : "")));
  const [modo, setModo] = useState<"manual" | "automatico">(estado.modo ?? "manual");
  return (
    <div className="space-y-4">
      {ambiente === "produccion" ? (
        <>
          <BotonArca />
          <TareasArca tareas={TAREAS_PUNTO_VENTA} hechas={hechas} onAlternar={onAlternar} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">En el modo prueba no hace falta darlo de alta en ARCA: dejá el <b>1</b>.</p>
      )}
      <div className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pv">Número de punto de venta</Label>
          <Input id="pv" value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className="rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label>¿Cuándo facturar?</Label>
          <div className="flex gap-2">
            {(["manual", "automatico"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)}
                className={cn("flex-1 rounded-xl border-2 px-2 py-1.5 text-xs font-medium", modo === m ? "border-primary bg-primary/5" : "border-border")}>
                {m === "manual" ? "Cuando lo pida" : "Todas las ventas"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          {modo === "manual" ? "Facturás tocando “Facturar” en el punto de venta o en Ventas." : "Cada venta se factura sola, sin que hagas nada."}
          {" "}Si tenés varias cajas, después podés darle a cada una su punto de venta en Caja → Puestos.
        </p>
        <Button className="rounded-xl sm:col-span-2 sm:w-fit" disabled={!puntoVenta || ocupado === "operacion"}
          onClick={() => correr("operacion", () => guardarOperacionAfip({ puntoVenta, ambiente, modo }), "Guardado")}>
          {ocupado === "operacion" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
        </Button>
      </div>
    </div>
  );
}

export function PasoProbar({ estado, correr, ocupado, irA }: PropsPaso & { irA: (p: PasoTutorial) => void }) {
  const [pasos, setPasos] = useState<PasoPrueba[] | null>(null);

  const probar = () =>
    correr("probar", async () => {
      const r = await probarAfip(true);
      setPasos(r.pasos);
      if (!r.ok) throw new Error("La prueba no salió bien: mirá abajo qué pasó");
      return r.estado;
    }, "¡Facturación activada!");

  const [emision, setEmision] = useState<PasoPrueba[] | null>(null);
  const emitir = () =>
    correr("emitir", async () => {
      const r = await emitirPruebaAfip();
      setEmision(r.pasos);
      if (!r.ok) throw new Error("La emisión de prueba no salió bien: mirá abajo qué pasó");
      return r.estado;
    }, "Factura de prueba y nota de crédito autorizadas por ARCA");

  const error = pasos?.find((p) => !p.ok);
  const explicacion = error ? explicarErrorAfip(error.detalle) : null;
  const errorEmision = emision?.find((p) => !p.ok);

  if (estado.activo) {
    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-2xl border border-success/40 bg-success/5 p-5 text-center">
          <PartyPopper className="mx-auto h-8 w-8 text-success" />
          <p className="text-lg font-semibold">¡Listo! Ya podés facturar.</p>
          <p className="text-sm text-muted-foreground">
            {estado.ambiente === "produccion" ? "Las facturas son reales." : "Estás en modo prueba: las facturas salen marcadas “sin validez fiscal”. Cuando quieras facturar de verdad, volvé al paso 1 y elegí “Facturar de verdad”."}
            {" "}{estado.modo === "automatico" ? "Cada venta se factura sola." : "Facturá con el botón “Facturar” en el punto de venta o en Ventas."}
          </p>
        </div>
        {estado.ambiente === "homologacion" && (
          <div className="space-y-3 rounded-2xl border p-4">
            <p className="text-sm font-semibold">Prueba completa de emisión</p>
            <p className="text-sm text-muted-foreground">
              Emite una factura de prueba de $121 a consumidor final, la consulta en ARCA y le emite la nota de crédito.
              Si tenés contingencia activada, también pide el CAEA. No queda atada a ninguna venta.
            </p>
            <Button variant="outline" className="rounded-xl" disabled={!!ocupado} onClick={emitir}>
              {ocupado === "emitir" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />} Emitir factura de prueba
            </Button>
            {emision && (
              <ul className="space-y-1 text-sm">
                {emision.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {p.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <span><b>{p.paso}</b> <span className="text-muted-foreground">· {p.detalle}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {errorEmision && (
              <p className="text-sm text-destructive">{explicarErrorAfip(errorEmision.detalle).queHacer}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Ahora probamos que todo esté bien conectado con ARCA. Tarda unos segundos.</p>
      <Button className="h-11 rounded-xl" disabled={!!ocupado} onClick={probar}>
        {ocupado === "probar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />} Probar y activar
      </Button>
      {pasos && (
        <ul className="space-y-1 text-sm">
          {pasos.filter((p) => p.ok).map((p, i) => (
            <li key={i} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {p.paso}</li>
          ))}
        </ul>
      )}
      {explicacion && (
        <div role="alert" className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-semibold text-destructive"><XCircle className="h-5 w-5" /> {explicacion.titulo}</p>
          <p className="text-sm">{explicacion.queHacer}</p>
          {explicacion.paso && (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => irA(explicacion.paso!)}>Ir a ese paso</Button>
          )}
        </div>
      )}
    </div>
  );
}
