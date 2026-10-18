"use client";

// components/stock/fotos-automaticas-dialog.tsx — fotos por codigo de barras desde
// Open Food Facts (base publica y gratuita de productos envasados). Recorre de a tandas
// (app/api/productos/fotos-automaticas) y muestra el avance. Las fotos se copian a
// nuestro almacenamiento; la tienda online muestra la atribucion (CC BY-SA).
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buscarFotosAutomaticas, contarFotosAutomaticas } from "@/services/products-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCambio: () => void;
}

export function FotosAutomaticasDialog({ open, onOpenChange, onCambio }: Props) {
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [avance, setAvance] = useState({ revisados: 0, encontradas: 0 });
  const cortar = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPendientes(null);
    setAvance({ revisados: 0, encontradas: 0 });
    contarFotosAutomaticas().then(setPendientes).catch(() => setPendientes(0));
  }, [open]);

  const buscar = async () => {
    setBuscando(true);
    cortar.current = false;
    let desde = 0;
    let total = { revisados: 0, encontradas: 0 };
    try {
      for (;;) {
        const r = await buscarFotosAutomaticas(desde);
        total = { revisados: total.revisados + r.revisados, encontradas: total.encontradas + r.encontradas };
        setAvance(total);
        desde = r.siguiente;
        if (r.quedan === 0 || r.revisados === 0 || cortar.current) break;
      }
      toast.success(`Listo: ${total.encontradas} foto${total.encontradas === 1 ? "" : "s"} nueva${total.encontradas === 1 ? "" : "s"}`);
      if (total.encontradas > 0) onCambio();
      setPendientes(await contarFotosAutomaticas().catch(() => 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron buscar las fotos");
    } finally {
      setBuscando(false);
    }
  };

  const porcentaje = pendientes ? Math.min(100, Math.round((avance.revisados / pendientes) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cortar.current = true; onOpenChange(o); }}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> Fotos de productos</DialogTitle>
          <DialogDescription>
            Para los productos envasados buscamos la foto por el código de barras en Open Food Facts, una base pública
            y gratuita. Los que no aparezcan (y la verdura, que no tiene código), cargalos desde Editar → Subir foto.
          </DialogDescription>
        </DialogHeader>

        {pendientes === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : pendientes === 0 && !buscando && avance.revisados === 0 ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm">No hay productos sin foto con código de barras.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl bg-muted px-3 py-2">
              <b>{pendientes}</b> producto{pendientes === 1 ? "" : "s"} sin foto con código de barras.
            </p>
            {(buscando || avance.revisados > 0) && (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="grad-money h-full transition-all" style={{ width: `${buscando ? porcentaje : 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Revisados {avance.revisados} · encontradas <b className="text-foreground">{avance.encontradas}</b>
                </p>
              </div>
            )}
            <Button className="w-full rounded-xl" disabled={buscando || pendientes === 0} onClick={() => void buscar()}>
              {buscando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {buscando ? "Buscando fotos…" : "Buscar fotos automáticamente"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Solo se manda el código de barras, ningún dato de tu comercio. Podés cambiar o quitar cualquier foto desde Editar.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
