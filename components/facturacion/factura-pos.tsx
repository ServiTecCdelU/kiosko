"use client";

// components/facturacion/factura-pos.tsx — boton de factura de la ultima venta
// en el POS, junto a "Reimprimir". Modo manual: "Facturar" (pide el CAE e
// imprime). Modo automatico: "Imprimir factura" (la que se emitio sola).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { CBTE } from "@/lib/afip/constantes";
import { useImprimirComprobante } from "@/components/facturacion/comprobante-fiscal";
import { facturarVenta, getFacturasDeVentas, getModoFacturacion } from "@/services/facturacion-service";

export function FacturaPos({ ventaId }: { ventaId: string | null }) {
  const [modo, setModo] = useState<"manual" | "automatico" | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const { imprimir, cargando, elemento } = useImprimirComprobante();

  useEffect(() => {
    getModoFacturacion().then((m) => setModo(m.activo ? m.modo : null)).catch(() => setModo(null));
  }, []);

  if (!modo || !ventaId) return null;

  const click = async () => {
    setTrabajando(true);
    try {
      if (modo === "manual") {
        const f = await facturarVenta(ventaId);
        if (f.estado !== "autorizada") throw new Error(f.error ?? "AFIP no autorizó la factura. Reintentá desde Ventas.");
        await imprimir(f.id);
      } else {
        const f = (await getFacturasDeVentas([ventaId])).find((x) => x.cbte_tipo === CBTE.FACTURA_C && x.estado !== "rechazada");
        if (f?.estado === "autorizada") await imprimir(f.id);
        else if (f?.estado === "error") toast.error(`La factura tuvo un error: ${f.error ?? ""}. Reintentá desde Ventas.`);
        else toast.info("La factura se está emitiendo. Probá de nuevo en unos segundos.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo facturar");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <button
        onClick={click}
        disabled={trabajando || cargando}
        className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
      >
        {trabajando || cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        {modo === "manual" ? "Facturar" : "Imprimir factura"}
      </button>
      {elemento}
    </>
  );
}
