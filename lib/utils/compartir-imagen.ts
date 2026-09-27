// lib/utils/compartir-imagen.ts — manda una imagen al menu "Compartir" del
// celular (WhatsApp, Instagram...) o, si el navegador no puede, la descarga.
import { generarImagenOferta, type FormatoImagen } from "@/lib/imagen-oferta";
import type { TemaCartelId } from "@/lib/cartel-temas";
import type { Product } from "@/lib/types";

export type ResultadoCompartir = "compartida" | "descargada" | "cancelada";

function nombreArchivo(nombre: string, formato: FormatoImagen): string {
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `oferta-${limpio.slice(0, 40) || "producto"}-${formato}.png`;
}

export async function compartirImagenOferta(
  producto: Product,
  opciones: { formato: FormatoImagen; tema: TemaCartelId; comercio?: string },
): Promise<ResultadoCompartir> {
  const blob = await generarImagenOferta(producto, opciones);
  const archivo = new File([blob], nombreArchivo(producto.name, opciones.formato), { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: `Oferta: ${producto.name}` });
      return "compartida";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelada";
      // otro error (ej. permiso): se cae a la descarga
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "descargada";
}
