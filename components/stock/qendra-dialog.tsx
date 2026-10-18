"use client";

// components/stock/qendra-dialog.tsx — manda los productos y precios a las balanzas
// Systel Cuora a traves de Qendra (lib/qendra.ts). Con Chrome/Edge se elige una vez
// la carpeta que vigila Qendra y "Enviar" sobrescribe el archivo; si no, se descarga.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FolderOpen, Loader2, Scale, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bytesQendra, generarQendra } from "@/lib/qendra";
import {
  NOMBRE_ARCHIVO_QENDRA, carpetaGuardada, elegirCarpeta, escribirEnCarpeta, soportaCarpeta,
} from "@/lib/qendra-carpeta";
import { descargarBlob } from "@/lib/utils/descargar";
import type { Product } from "@/lib/types";

interface QendraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
}

type Carpeta = Awaited<ReturnType<typeof carpetaGuardada>>;

export function QendraDialog({ open, onOpenChange, products }: QendraDialogProps) {
  const [carpeta, setCarpeta] = useState<Carpeta>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) carpetaGuardada().then(setCarpeta);
  }, [open]);

  const resultado = useMemo(
    () => generarQendra(products.map((p) => ({
      name: p.name, codigo: p.codigo, price: p.price, unidad: p.unidad, category: p.category, disabled: p.disabled,
      ofertaActiva: p.ofertaActiva, ofertaTipo: p.ofertaTipo, ofertaValor: p.ofertaValor,
      ofertaCantidad: p.ofertaCantidad, ofertaDesde: p.ofertaDesde, ofertaHasta: p.ofertaHasta,
    }))),
    [products],
  );

  const elegir = async () => {
    try {
      const c = await elegirCarpeta();
      if (c) setCarpeta(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo elegir la carpeta");
    }
  };

  const enviar = async () => {
    if (!carpeta) return;
    setEnviando(true);
    try {
      await escribirEnCarpeta(carpeta, bytesQendra(resultado.lineas));
      toast.success(`${resultado.incluidos} productos enviados a ${carpeta.name}`, {
        description: "Qendra los toma y los transmite a las balanzas (si está configurado para importar solo).",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el archivo");
    } finally {
      setEnviando(false);
    }
  };

  const descargar = () => {
    descargarBlob(new Blob([bytesQendra(resultado.lineas)], { type: "text/csv" }), NOMBRE_ARCHIVO_QENDRA);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scale className="h-4 w-4 text-primary" /> Balanzas Systel (Qendra)</DialogTitle>
          <DialogDescription>
            Pasa nombres y precios a las Cuora. Van los productos cuyo código es el de la balanza (un número de 1 a 99997).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-xl bg-muted px-3 py-2">
            <b>{resultado.incluidos}</b> productos listos para la balanza
            {resultado.omitidos.length > 0 && <>, <b>{resultado.omitidos.length}</b> por kg quedan afuera</>}.
            {resultado.conOferta > 0 && <> <b>{resultado.conOferta}</b> van con el precio de oferta de hoy.</>}
          </p>

          {resultado.combos.length > 0 && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              La balanza no puede hacer combos: <b>{resultado.combos.join(", ")}</b> va a precio de lista.
              La caja aplica el combo igual cuando escanea la etiqueta.
            </p>
          )}

          {resultado.omitidos.length > 0 && (
            <details className="rounded-xl border px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver los que quedan afuera</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                {resultado.omitidos.map((o, i) => (
                  <li key={i}><b>{o.name}</b>: {o.motivo}</li>
                ))}
              </ul>
            </details>
          )}

          {soportaCarpeta() ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {carpeta
                  ? <>Carpeta de Qendra: <b className="text-foreground">{carpeta.name}</b></>
                  : "Elegí la carpeta de “Origen de datos” de Qendra (Configuración → Importar). Se recuerda en esta PC."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-xl" disabled={!carpeta || enviando || resultado.incluidos === 0} onClick={enviar}>
                  {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Enviar a la balanza
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={elegir}>
                  <FolderOpen className="mr-1.5 h-4 w-4" /> {carpeta ? "Cambiar carpeta" : "Elegir carpeta"}
                </Button>
                <Button variant="ghost" className="rounded-xl" disabled={resultado.incluidos === 0} onClick={descargar}>
                  <Download className="mr-1.5 h-4 w-4" /> Descargar
                </Button>
              </div>
            </div>
          ) : (
            <Button className="rounded-xl" disabled={resultado.incluidos === 0} onClick={descargar}>
              <Download className="mr-1.5 h-4 w-4" /> Descargar {NOMBRE_ARCHIVO_QENDRA}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            En Qendra: Configuración → Importar, activá “Verificar la existencia del archivo cada N minutos” y
            “Transmitir novedades a las balanzas después de importar”. Así cada cambio de precio llega solo a la balanza.
            Volvé a enviar cuando empiece o termine una oferta.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
