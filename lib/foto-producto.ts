// lib/foto-producto.ts — achica la foto en el navegador antes de subirla.
// Una foto de celular pesa 3-6 MB; para la tienda y el stock alcanza con 800 px.
// Se pasa a WebP (o JPEG si el navegador no sabe hacer WebP): queda en ~60-150 KB.

const LADO_MAX = 800;
const CALIDAD = 0.82;

function cargarImagen(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function aBlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), tipo, CALIDAD));
}

/** Foto lista para subir: lado mayor de hasta 800 px, WebP o JPEG. */
export async function achicarFoto(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) throw new Error("Elegí una imagen (JPG, PNG o WebP)");
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  // Fondo blanco: un PNG con transparencia no queda negro al pasarlo a JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = await aBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await aBlob(canvas, "image/jpeg");
  if (!jpeg) throw new Error("No se pudo procesar la imagen");
  return jpeg;
}
