// services/leer-factura-pdf.ts — lee en el navegador la factura del proveedor:
// del PDF saca el QR de AFIP (renderizando la pagina) y el texto posicionado
// para los renglones (lib/afip/renglones-pdf.ts); de una foto o captura saca
// solo el QR. pdfjs y zxing se cargan a demanda: pesan y solo se usan aca.
import { leerRenglones, type LecturaRenglones, type TextoPosicionado } from "@/lib/afip/renglones-pdf";

export interface LecturaPdf extends LecturaRenglones {
  /** Texto del QR de AFIP (URL), o null si no se encontro ninguno. */
  qr: string | null;
  paginas: number;
}

async function cargarPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

async function lectorQr() {
  const { BrowserQRCodeReader } = await import("@zxing/browser");
  return new BrowserQRCodeReader();
}

function esQrAfip(texto: string): boolean {
  return /afip\.gob\.ar|arca\.gob\.ar/i.test(texto) || texto.trim().startsWith("{");
}

/** Intenta decodificar un QR del canvas; null si no hay. */
async function qrDeCanvas(reader: Awaited<ReturnType<typeof lectorQr>>, canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const r = reader.decodeFromCanvas(canvas);
    return r?.getText() ?? null;
  } catch {
    return null;
  }
}

/** Renderiza la pagina y busca el QR: pagina entera y despues en cuadrantes (el QR de AFIP suele ir abajo a la izquierda). */
async function qrDePagina(pdfjs: Awaited<ReturnType<typeof cargarPdfjs>>, pagina: any, reader: Awaited<ReturnType<typeof lectorQr>>): Promise<string | null> {
  for (const escala of [2, 3.5]) {
    const viewport = pagina.getViewport({ scale: escala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
    const entero = await qrDeCanvas(reader, canvas);
    if (entero && esQrAfip(entero)) return entero;

    // Cuadrantes con algo de solapamiento.
    const w = canvas.width, h = canvas.height;
    const zonas = [
      [0, h * 0.5, w * 0.55, h * 0.5], [w * 0.45, h * 0.5, w * 0.55, h * 0.5],
      [0, 0, w * 0.55, h * 0.55], [w * 0.45, 0, w * 0.55, h * 0.55],
    ];
    for (const [sx, sy, sw, sh] of zonas) {
      const c = document.createElement("canvas");
      c.width = Math.ceil(sw);
      c.height = Math.ceil(sh);
      c.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const r = await qrDeCanvas(reader, c);
      if (r && esQrAfip(r)) return r;
    }
  }
  return null;
}

export async function leerFacturaPdf(file: File, onEstado?: (texto: string) => void): Promise<LecturaPdf> {
  onEstado?.("Abriendo el PDF…");
  const pdfjs = await cargarPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const reader = await lectorQr();

  let qr: string | null = null;
  const textos: TextoPosicionado[] = [];
  const paginas = Math.min(doc.numPages, 6);
  for (let n = 1; n <= paginas; n++) {
    const pagina = await doc.getPage(n);
    onEstado?.(`Leyendo página ${n} de ${paginas}…`);
    const contenido = await pagina.getTextContent();
    // Las paginas se apilan hacia abajo restando la altura, para que el orden de lineas sea el del papel.
    const desplazamiento = -(n - 1) * 10_000;
    for (const it of contenido.items as any[]) {
      if (typeof it.str !== "string") continue;
      textos.push({ texto: it.str, x: it.transform[4], y: it.transform[5] + desplazamiento, ancho: it.width });
    }
    if (!qr) {
      onEstado?.(`Buscando el QR de AFIP en la página ${n}…`);
      qr = await qrDePagina(pdfjs, pagina, reader);
    }
  }
  const lectura = leerRenglones(textos);
  return { ...lectura, qr, paginas: doc.numPages };
}

/** QR de una foto o captura de pantalla de la factura. */
export async function leerQrDeImagen(file: File): Promise<string | null> {
  const reader = await lectorQr();
  const url = URL.createObjectURL(file);
  try {
    const r = await reader.decodeFromImageUrl(url);
    return r?.getText() ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
