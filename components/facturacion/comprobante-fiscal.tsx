"use client";

// components/facturacion/comprobante-fiscal.tsx — Factura C / Nota de credito C
// impresa en ticket de 80 mm, con los datos que exige AFIP: emisor, numero,
// CAE y vencimiento, y el QR (RG 4291). Se imprime con el navegador.
//
// useImprimirComprobante() lo trae, arma el QR y llama a window.print()
// marcando body[data-imprimir="factura"] (ver app/globals.css).
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";
import { NOMBRE_CBTE } from "@/lib/afip/constantes";
import { numeroComprobante } from "@/lib/afip/comprobante";
import { getComprobante, type Comprobante } from "@/services/facturacion-service";

const DOC_LABEL: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Consumidor final" };

function dia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function ComprobanteFiscal({ datos, qr }: { datos: Comprobante; qr: string }) {
  const { comprobante: c, emisor: e } = datos;
  const sumaItems = c.items.reduce((s, i) => s + i.subtotal, 0);
  const ajuste = Math.round((c.total - sumaItems) * 100) / 100;

  return (
    <div id="factura-print" className="bg-white p-2 font-mono text-[11px] leading-tight text-black">
      <p className="text-center text-sm font-bold">{e.razonSocial}</p>
      <p className="text-center">CUIT {e.cuit}</p>
      <p className="text-center">{e.domicilio}</p>
      {e.ingresosBrutos && <p className="text-center">IIBB {e.ingresosBrutos}</p>}
      <p className="text-center">Inicio de actividades {dia(e.inicioActividades)}</p>
      <p className="text-center">Responsable Monotributo</p>
      <div className="my-1 border-t border-dashed border-black" />
      <p className="text-center text-sm font-bold">{NOMBRE_CBTE[c.cbteTipo]} (cód. {String(c.cbteTipo).padStart(3, "0")})</p>
      <p className="text-center">N° {numeroComprobante(c.puntoVenta, c.numero)}</p>
      <p className="text-center">Fecha {dia(c.fecha)}</p>
      {c.asociado && (
        <p className="text-center">Asociada a {NOMBRE_CBTE[c.asociado.cbteTipo]} {numeroComprobante(c.asociado.puntoVenta, c.asociado.numero)}</p>
      )}
      <div className="my-1 border-t border-dashed border-black" />
      <p>
        {DOC_LABEL[c.docTipo] ?? `Doc ${c.docTipo}`}
        {c.docTipo !== 99 && ` ${c.docNro}`}
        {c.receptorNombre && ` · ${c.receptorNombre}`}
      </p>
      <div className="my-1 border-t border-dashed border-black" />
      {c.items.map((it, i) => (
        <div key={i} className="mb-0.5">
          <p className="line-clamp-2">{it.nombre}</p>
          <div className="flex justify-between">
            <span>{it.cantidad} x {formatCurrency(it.precio)}</span>
            <span>{formatCurrency(it.subtotal)}</span>
          </div>
        </div>
      ))}
      {ajuste !== 0 && c.items.length > 0 && (
        <div className="flex justify-between"><span>{ajuste < 0 ? "Descuento" : "Recargo"}</span><span>{formatCurrency(ajuste)}</span></div>
      )}
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{formatCurrency(c.total)}</span></div>
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR de AFIP" width={96} height={96} className="h-24 w-24" />
        <div>
          <p>CAE {c.cae}</p>
          <p>Vto. CAE {dia(c.caeVto)}</p>
          {c.ambiente === "homologacion" && <p className="font-bold">PRUEBA (homologación) · SIN VALIDEZ FISCAL</p>}
          <p>Comprobante autorizado por ARCA</p>
        </div>
      </div>
    </div>
  );
}

export function useImprimirComprobante() {
  const [datos, setDatos] = useState<{ comprobante: Comprobante; qr: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  const imprimir = useCallback(async (facturaId: string) => {
    setCargando(true);
    try {
      const comprobante = await getComprobante(facturaId);
      const qr = await QRCode.toDataURL(comprobante.comprobante.qr, { margin: 0, width: 192 });
      setDatos({ comprobante, qr });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar el comprobante");
    } finally {
      setCargando(false);
    }
  }, []);

  // Recien con el comprobante en el DOM se imprime; despues se limpia.
  useEffect(() => {
    if (!datos) return;
    document.body.dataset.imprimir = "factura";
    const limpiar = () => {
      delete document.body.dataset.imprimir;
      setDatos(null);
    };
    window.addEventListener("afterprint", limpiar, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", limpiar);
      delete document.body.dataset.imprimir;
    };
  }, [datos]);

  const elemento = datos ? <ComprobanteFiscal datos={datos.comprobante} qr={datos.qr} /> : null;
  return { imprimir, cargando, elemento };
}
