"use client";

// components/stock/qendra-dialog.tsx — manda los productos y precios a las balanzas
// Systel Cuora a traves de Qendra (lib/qendra.ts). Con Chrome/Edge se elige una vez
// la carpeta que vigila Qendra y "Enviar" sobrescribe el archivo; si no, se descarga.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FolderOpen, Loader2, PackagePlus, Scale, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bytesQendra, codigoLibre, generarQendra, nombrePack, type ResultadoQendra } from "@/lib/qendra";
import { createProduct, getCatalogoCompleto } from "@/services/products-service";
import { formatCurrency } from "@/lib/utils/format";
import {
  NOMBRE_ARCHIVO_QENDRA, carpetaGuardada, elegirCarpeta, escribirEnCarpeta, soportaCarpeta,
} from "@/lib/qendra-carpeta";
import { descargarBlob } from "@/lib/utils/descargar";
import type { Product } from "@/lib/types";

interface QendraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se creo un producto (pack de oferta): recargar la lista de Stock. */
  onCambio?: () => void;
}

type Carpeta = Awaited<ReturnType<typeof carpetaGuardada>>;

export function QendraDialog({ open, onOpenChange, onCambio }: QendraDialogProps) {
  // Todo el catalogo (la lista de Stock esta paginada).
  const [products, setProducts] = useState<Product[] | null>(null);
  const cargar = () => getCatalogoCompleto().then(setProducts).catch(() => toast.error("No se pudo cargar el catálogo"));
  const [carpeta, setCarpeta] = useState<Carpeta>(null);
  const [enviando, setEnviando] = useState(false);
  const [creando, setCreando] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    carpetaGuardada().then(setCarpeta);
    setProducts(null);
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resultado = useMemo(
    () => generarQendra((products ?? []).map((p) => ({
      id: p.id, packDe: p.packDe, name: p.name, codigo: p.codigo, price: p.price, unidad: p.unidad, category: p.category, disabled: p.disabled,
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

  // Combo -> producto aparte por unidad (71_productos_pack.sql) que la balanza si puede vender.
  const crearPack = async (combo: ResultadoQendra["combos"][number]) => {
    if (!combo.id) return;
    const codigo = codigoLibre((products ?? []).map((p) => p.codigo));
    if (!codigo) {
      toast.error("No quedan códigos de balanza libres");
      return;
    }
    setCreando(combo.id);
    try {
      await createProduct({
        name: nombrePack(combo), price: combo.valor, stock: 0, codigo, category: combo.category ?? "",
        unidad: "un", stockControlado: false, revisar: false, packDe: combo.id, packCantidad: combo.cantidad,
      });
      toast.success(`Creado “${nombrePack(combo)}” con el código ${codigo}`, {
        description: `Cada uno descuenta ${combo.cantidad} ${combo.unidad} de ${combo.name}. Ahora enviá los precios a la balanza.`,
      });
      onCambio?.();
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setCreando(null);
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
          {products === null ? (
            <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando el catálogo…</p>
          ) : (
          <p className="rounded-xl bg-muted px-3 py-2">
            <b>{resultado.incluidos}</b> productos listos para la balanza
            {resultado.omitidos.length > 0 && <>, <b>{resultado.omitidos.length}</b> quedan afuera</>}.
            {resultado.conOferta > 0 && <> <b>{resultado.conOferta}</b> van con el precio de oferta de hoy.</>}
          </p>
          )}

          {resultado.combos.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <p>
                La balanza no hace combos. Creá un producto aparte para la oferta: se vende por unidad en la
                balanza y descuenta el stock del producto original.
              </p>
              {resultado.combos.map((c) => (
                <div key={c.id ?? c.name} className="flex items-center justify-between gap-2">
                  <span><b>{c.name}</b>: {c.cantidad} {c.unidad} x {formatCurrency(c.valor)}</span>
                  <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-xl" disabled={!c.id || creando !== null} onClick={() => crearPack(c)}>
                    {creando === c.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="mr-1.5 h-3.5 w-3.5" />}
                    Crear “{nombrePack(c)}”
                  </Button>
                </div>
              ))}
            </div>
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
