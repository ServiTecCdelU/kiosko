"use client";

// components/pos/datos-ticket-config.tsx — "Datos del ticket" en Mi comercio: logo,
// nombre, direccion y CUIT que salen arriba del ticket (Zebra, termica y
// navegador). El logo se pasa aca a blanco y negro (lib/zpl-logo.ts) y se guarda
// ya listo para la impresora: no hace falta subir la imagen a ningun lado.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/utils/api-url";
import { LOGO_MAX_ALTO, LOGO_MAX_ANCHO, type DatosTicket, type LogoTicket } from "@/lib/ticket-negocio";
import { comprimirFilas, filasDesdePixeles, recortarFilasBlancas } from "@/lib/zpl-logo";
import { guardarDatosTicketEnCache } from "@/hooks/use-datos-ticket";

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/** Achica la imagen al tamaño del ticket y la pasa a puntos blanco y negro. */
function procesarLogo(img: HTMLImageElement, umbral: number): LogoTicket | null {
  // Un logo chico se agranda hasta el doble, no mas (se pixelaria).
  const escala = Math.min(LOGO_MAX_ANCHO / img.naturalWidth, LOGO_MAX_ALTO / img.naturalHeight, 2);
  const ancho = Math.max(8, Math.round(img.naturalWidth * escala));
  const alto = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, ancho, alto);
  const filas = recortarFilasBlancas(filasDesdePixeles(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto, umbral));
  if (filas.length === 0) return null;

  // Vista previa: lo mismo que va a imprimir la Zebra.
  const bytesPorFila = Math.ceil(ancho / 8);
  const vista = document.createElement("canvas");
  vista.width = bytesPorFila * 8;
  vista.height = filas.length;
  const v = vista.getContext("2d");
  if (!v) return null;
  const px = v.createImageData(vista.width, vista.height);
  filas.forEach((fila, y) => {
    for (let x = 0; x < vista.width; x++) {
      const byte = parseInt(fila.slice((x >> 3) * 2, (x >> 3) * 2 + 2), 16);
      const negro = (byte & (0x80 >> (x & 7))) !== 0;
      const i = (y * vista.width + x) * 4;
      px.data[i] = px.data[i + 1] = px.data[i + 2] = negro ? 0 : 255;
      px.data[i + 3] = 255;
    }
  });
  v.putImageData(px, 0, 0);

  return { bytesPorFila, alto: filas.length, datos: comprimirFilas(filas), vista: vista.toDataURL("image/png") };
}

export function DatosTicketConfig() {
  const [datos, setDatos] = useState<DatosTicket | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null);
  const [umbral, setUmbral] = useState(140);
  const archivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/comercio"))
      .then((r) => r.json())
      .then((d) => setDatos(d.ticket ?? null))
      .catch(() => toast.error("No se pudieron cargar los datos del ticket"));
  }, []);

  // Cambiar el contraste reprocesa la imagen original, no la ya convertida.
  useEffect(() => {
    if (!imagen) return;
    const logo = procesarLogo(imagen, umbral);
    setDatos((d) => (d ? { ...d, logo } : d));
  }, [imagen, umbral]);

  if (!datos) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const cambiar = (parcial: Partial<DatosTicket>) => setDatos((d) => (d ? { ...d, ...parcial } : d));

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      const img = await cargarImagen(archivo);
      if (!procesarLogo(img, umbral)) throw new Error("La imagen está en blanco");
      setImagen(img);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo usar la imagen");
    } finally {
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  const quitarLogo = () => {
    setImagen(null);
    cambiar({ logo: null });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(apiUrl("/api/comercio"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: datos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      setDatos(data.ticket);
      guardarDatosTicketEnCache(data.ticket);
      toast.success("Datos del ticket guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4 text-primary" /> Datos del ticket</h2>
        <p className="text-sm text-muted-foreground">Lo que sale arriba de cada ticket que imprimís. Lo que dejes vacío no se imprime.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-24 w-full items-center justify-center rounded-xl border bg-white p-2 sm:w-48">
          {datos.logo?.vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={datos.logo.vista} alt="Logo del ticket" className="max-h-full max-w-full" />
          ) : (
            <span className="text-xs text-muted-foreground">Sin logo</span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => archivoRef.current?.click()}>
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> {datos.logo ? "Cambiar logo" : "Elegir logo"}
            </Button>
            {datos.logo && (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={quitarLogo}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar
              </Button>
            )}
          </div>
          {imagen && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Más claro
              <input type="range" min={60} max={230} step={10} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} aria-label="Contraste del logo" />
              Más oscuro
            </label>
          )}
          <p className="text-xs text-muted-foreground">La ticketera imprime en blanco y negro: así va a salir. Mejor un logo simple, con fondo blanco o transparente.</p>
        </div>
        <input ref={archivoRef} type="file" accept="image/*" className="hidden" onChange={(e) => void elegirArchivo(e.target.files?.[0])} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nombre del negocio</span>
          <Input value={datos.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} maxLength={60} className="rounded-xl" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Dirección</span>
          <Input value={datos.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} maxLength={120} placeholder="San Martín 123, Paraná" className="rounded-xl" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">CUIT</span>
          <Input value={datos.cuit} onChange={(e) => cambiar({ cuit: e.target.value })} maxLength={20} placeholder="20-12345678-9" className="rounded-xl" />
        </label>
      </div>

      <Button className="rounded-2xl" disabled={guardando} onClick={() => void guardar()}>
        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
      </Button>
    </section>
  );
}
