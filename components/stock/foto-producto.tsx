"use client";

// components/stock/foto-producto.tsx — foto del producto (tienda online y stock).
// Se guarda al elegirla, sin esperar al "Guardar" del producto. En el celular,
// "Sacar foto" abre la camara. Se achica antes de subir (lib/foto-producto.ts).
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/foto-producto";
import { quitarFotoProducto, subirFotoProducto } from "@/services/products-service";

interface FotoProductoProps {
  productoId: string;
  nombre: string;
  url: string | null | undefined;
  onCambio: (url: string | null) => void;
}

export function FotoProducto({ productoId, nombre, url, onCambio }: FotoProductoProps) {
  const [actual, setActual] = useState<string | null>(url || null);
  const [ocupado, setOcupado] = useState(false);
  const galeria = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setOcupado(true);
    try {
      const nueva = await subirFotoProducto(productoId, await achicarFoto(archivo));
      setActual(nueva);
      onCambio(nueva);
      toast.success("Foto guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setOcupado(false);
      if (galeria.current) galeria.current.value = "";
      if (camara.current) camara.current.value = "";
    }
  };

  const quitar = async () => {
    setOcupado(true);
    try {
      await quitarFotoProducto(productoId);
      setActual(null);
      onCambio(null);
      toast.success("Foto quitada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar la foto");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-muted/30 p-3">
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card">
        {actual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actual} alt={nombre} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-7 w-7 text-muted-foreground/40" />
        )}
        {ocupado && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-muted-foreground">
          {actual ? "Así se ve en tu tienda online." : "Con foto se vende más en la tienda online."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={ocupado} onClick={() => galeria.current?.click()}>
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> {actual ? "Cambiar" : "Subir foto"}
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-xl sm:hidden" disabled={ocupado} onClick={() => camara.current?.click()}>
            <Camera className="mr-1.5 h-3.5 w-3.5" /> Sacar foto
          </Button>
          {actual && (
            <Button type="button" size="sm" variant="ghost" className="rounded-xl text-muted-foreground" disabled={ocupado} onClick={() => void quitar()}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar
            </Button>
          )}
        </div>
      </div>
      <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => void subir(e.target.files?.[0])} />
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void subir(e.target.files?.[0])} />
    </div>
  );
}
