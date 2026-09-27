// lib/imagen-oferta.ts — imagen PNG de una oferta para estados de WhatsApp,
// historias o posts de Instagram. Se dibuja en un <canvas> del navegador (sin
// librerias). Solo navegador: usa document. Imports relativos con .ts como el
// resto de lib/ puro.
import { type ConOferta, pesos } from "./pricing.ts";
import { analizarOferta, etiquetaOferta } from "./oferta-analisis.ts";
import { textoVigencia } from "./oferta-vigencia.ts";
import { temaCartel, type TemaCartelId } from "./cartel-temas.ts";

export type FormatoImagen = "historia" | "post";

export const MEDIDAS_IMAGEN: Record<FormatoImagen, { ancho: number; alto: number }> = {
  historia: { ancho: 1080, alto: 1920 },
  post: { ancho: 1080, alto: 1080 },
};

interface ProductoImagen extends ConOferta {
  name: string;
  unidad?: "un" | "kg";
}

interface OpcionesImagen {
  formato: FormatoImagen;
  tema?: TemaCartelId;
  comercio?: string;
}

const AMARILLO = "#ffd400";
const GIRO_BADGE = (-4 * Math.PI) / 180;
const FAMILIA = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const VERDE = "#0f8a3c";

function fuente(tamano: number, peso = 900, italica = false): string {
  return `${italica ? "italic " : ""}${peso} ${tamano}px ${FAMILIA}`;
}

/** Mayor tamaño (<= max) con el que `texto` entra en `anchoMax`. */
function ajustar(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number, max: number, peso = 900, italica = false): number {
  let t = max;
  ctx.font = fuente(t, peso, italica);
  while (t > 12 && ctx.measureText(texto).width > anchoMax) {
    t -= 4;
    ctx.font = fuente(t, peso, italica);
  }
  return t;
}

/** Parte el texto en lineas que entren en `anchoMax`; corta con "…" si pasa de `maxLineas`. */
function partir(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number, maxLineas: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width <= anchoMax || !actual) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    const cortadas = lineas.slice(0, maxLineas);
    cortadas[maxLineas - 1] = `${cortadas[maxLineas - 1].replace(/\s+\S*$/, "")}…`;
    return cortadas;
  }
  return lineas;
}

function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Bloque {
  alto: number;
  dibujar: (y: number) => void;
}

/** Dibuja la oferta en un canvas nuevo y lo devuelve (util para previsualizar o exportar). */
export function dibujarImagenOferta(p: ProductoImagen, opciones: OpcionesImagen): HTMLCanvasElement {
  const { ancho: W, alto: H } = MEDIDAS_IMAGEN[opciones.formato];
  const t = temaCartel(opciones.tema);
  const esHistoria = opciones.formato === "historia";
  const kBase = esHistoria ? 1 : 0.62; // escala vertical del contenido en el formato cuadrado
  const margen = W * 0.08;
  const anchoUtil = W - margen * 2;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite dibujar la imagen");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Fondo: degradado del tema + dos circulos suaves de adorno
  const fondo = ctx.createLinearGradient(0, 0, W * 0.3, H);
  fondo.addColorStop(0, t.principal);
  fondo.addColorStop(1, t.profundo);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath(); ctx.arc(W * 0.95, H * 0.12, W * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.02, H * 0.9, W * 0.35, 0, Math.PI * 2); ctx.fill();

  const a = analizarOferta(p);
  const etiqueta = etiquetaOferta(p);
  const esCombo = p.ofertaTipo === "combo";
  const porKg = p.unidad === "kg" ? "/kg" : "";

  // Titulo arriba y comercio abajo quedan fijos; el resto se reparte en el medio
  const tamTitulo = ajustar(ctx, t.titulo, anchoUtil, 150 * kBase + 20, 900, true);
  const yTitulo = margen + tamTitulo;
  ctx.fillStyle = "#ffffff";
  ctx.font = fuente(tamTitulo, 900, true);
  ctx.fillText(t.titulo, W / 2, yTitulo);

  const altoPie = opciones.comercio ? 70 * kBase + 30 : 0;
  if (opciones.comercio) {
    ctx.font = fuente(ajustar(ctx, opciones.comercio, anchoUtil, 54 * kBase + 10, 800), 800);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(`📍 ${opciones.comercio}`, W / 2, H - margen);
  }

  // Los bloques del medio se arman con una escala `k`; si no entran, se achican
  const armarBloques = (k: number): Bloque[] => {
    const bloques: Bloque[] = [];

    if (etiqueta) {
      const tam = ajustar(ctx, etiqueta, anchoUtil * 0.8, esCombo ? 230 * k : 170 * k);
      ctx.font = fuente(tam);
      const w = ctx.measureText(etiqueta).width + tam * 0.9;
      const h = tam * 1.25;
      // Al girar, las puntas del badge suben y bajan: se reserva ese espacio
      const giro = Math.abs(Math.sin(GIRO_BADGE)) * w;
      bloques.push({
        alto: h + giro + 18,
        dibujar: (y) => {
          ctx.save();
          ctx.translate(W / 2, y + giro / 2 + h / 2);
          ctx.rotate(GIRO_BADGE);
          ctx.fillStyle = t.profundo;
          rectRedondo(ctx, -w / 2 + 18, -h / 2 + 18, w, h, h * 0.22);
          ctx.fill();
          ctx.fillStyle = t.badgeFondo;
          rectRedondo(ctx, -w / 2, -h / 2, w, h, h * 0.22);
          ctx.fill();
          ctx.fillStyle = t.badgeTexto;
          ctx.font = fuente(tam);
          ctx.textBaseline = "middle";
          ctx.fillText(etiqueta, 0, h * 0.04);
          ctx.restore();
        },
      });
    }

    const tamNombre = Math.round(76 * k + 14);
    ctx.font = fuente(tamNombre, 800);
    const lineasNombre = partir(ctx, p.name.toUpperCase(), anchoUtil, esHistoria ? 3 : 2);
    bloques.push({
      alto: lineasNombre.length * tamNombre * 1.12,
      dibujar: (y) => {
        ctx.font = fuente(tamNombre, 800);
        ctx.fillStyle = "#ffffff";
        lineasNombre.forEach((l, i) => ctx.fillText(l, W / 2, y + tamNombre * (i + 0.9) * 1.12));
      },
    });

    const antes = esCombo ? `Llevando ${a.unidades}` : `${pesos(p.price)}${porKg}`;
    const tamAntes = Math.round(64 * k + 10);
    const precio = `${pesos(a.totalPromo)}${porKg}`;
    const tamPrecio = ajustar(ctx, precio, anchoUtil, 300 * k + 30);
    bloques.push({
      alto: tamAntes * 1.2 + tamPrecio * 1.02,
      dibujar: (y) => {
        ctx.font = fuente(tamAntes, esCombo ? 800 : 600);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        const yAntes = y + tamAntes;
        ctx.fillText(antes, W / 2, yAntes);
        if (!esCombo) {
          const w = ctx.measureText(antes).width;
          ctx.strokeStyle = t.badgeFondo;
          ctx.lineWidth = Math.max(6, tamAntes * 0.1);
          ctx.beginPath();
          ctx.moveTo(W / 2 - w / 2 - 8, yAntes - tamAntes * 0.33);
          ctx.lineTo(W / 2 + w / 2 + 8, yAntes - tamAntes * 0.33);
          ctx.stroke();
        }
        ctx.font = fuente(tamPrecio);
        // El precio va en amarillo si el tema lo usa; si no, blanco (rojo sobre verde no se lee)
        ctx.fillStyle = t.badgeFondo === AMARILLO ? AMARILLO : "#ffffff";
        ctx.fillText(precio, W / 2, yAntes + tamAntes * 0.2 + tamPrecio * 0.95);
      },
    });

    if (a.ahorroTotal > 0) {
      const texto = `Ahorrás ${pesos(a.ahorroTotal)}`;
      const tam = Math.round(58 * k + 10);
      ctx.font = fuente(tam, 800);
      const w = ctx.measureText(texto).width + tam * 1.4;
      const h = tam * 1.6;
      bloques.push({
        alto: h,
        dibujar: (y) => {
          ctx.fillStyle = "#ffffff";
          rectRedondo(ctx, W / 2 - w / 2, y, w, h, h / 2);
          ctx.fill();
          ctx.fillStyle = VERDE;
          ctx.font = fuente(tam, 800);
          ctx.textBaseline = "middle";
          ctx.fillText(texto, W / 2, y + h / 2 + tam * 0.04);
          ctx.textBaseline = "alphabetic";
        },
      });
    }

    const vigencia = textoVigencia(p.ofertaDesde, p.ofertaHasta);
    const tamVig = Math.round(44 * k + 8);
    bloques.push({
      alto: tamVig * 1.2,
      dibujar: (y) => {
        ctx.font = fuente(tamVig, 700);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(`⏰ ${vigencia}`, W / 2, y + tamVig);
      },
    });

    return bloques;
  };

  // Reparto vertical parejo entre el titulo y el pie (como space-evenly)
  const arriba = yTitulo + 20;
  const abajo = H - margen - altoPie;
  const MIN_HUECO = 16;
  let k = kBase;
  let bloques = armarBloques(k);
  const altoDe = (bs: Bloque[]) => bs.reduce((s, b) => s + b.alto, 0) + MIN_HUECO * (bs.length + 1);
  while (altoDe(bloques) > abajo - arriba && k > kBase * 0.5) {
    k *= 0.9;
    bloques = armarBloques(k);
  }
  const total = bloques.reduce((s, b) => s + b.alto, 0);
  const hueco = Math.max(MIN_HUECO, (abajo - arriba - total) / (bloques.length + 1));
  let y = arriba + hueco;
  for (const b of bloques) {
    b.dibujar(y);
    y += b.alto + hueco;
  }

  return canvas;
}

export function generarImagenOferta(p: ProductoImagen, opciones: OpcionesImagen): Promise<Blob> {
  const canvas = dibujarImagenOferta(p, opciones);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
  });
}
