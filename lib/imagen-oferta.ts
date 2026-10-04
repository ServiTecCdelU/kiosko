// lib/imagen-oferta.ts — imagen PNG de una oferta para estados de WhatsApp,
// historias o posts de Instagram. Dibuja en un <canvas> EL MISMO cartel que se
// ve en pantalla (components/stock/cartel-oferta.tsx): mismas medidas en `em`,
// colores y textos, para que lo que se descarga sea lo que se previsualizo.
// Si se cambia el diseño del cartel, cambiar tambien este archivo.
// Solo navegador: usa document. Imports relativos con .ts como el resto de lib/ puro.
import { type ConOferta, pesos } from "./pricing.ts";
import { analizarOferta, etiquetaOferta } from "./oferta-analisis.ts";
import { textoVigencia } from "./oferta-vigencia.ts";
import { tamanoTitulo, temaCartel, type TemaCartelId } from "./cartel-temas.ts";

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

const VERDE = "#0f8a3c";
/** Medidas del cartel en `em` (las mismas que CartelOferta). */
const CARTEL_ANCHO = 40;
const CARTEL_ALTO = 56.5;
const GIRO_BADGE = (-3 * Math.PI) / 180;
const FAMILIA_RESPALDO = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** La letra de la app (Geist), la misma con la que se ve el cartel en pantalla. */
function familiaDeLaApp(): string {
  try {
    return getComputedStyle(document.body).fontFamily || FAMILIA_RESPALDO;
  } catch {
    return FAMILIA_RESPALDO;
  }
}

/** Igual que `ajustar` de CartelOferta: tamaño (em) para que `largo` letras entren en `ancho` em. */
function emAjustado(largo: number, ancho: number, max: number): number {
  return Math.min(max, ancho / Math.max(largo * 0.58, 1));
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
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Corta el texto con "…" hasta que entre en `anchoMax`. */
function recortar(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number): string {
  if (ctx.measureText(texto).width <= anchoMax) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > anchoMax) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

interface Bloque {
  alto: number;
  dibujar: (y: number) => void;
}

/** Dibuja la oferta en un canvas nuevo y lo devuelve (util para previsualizar o exportar). */
export function dibujarImagenOferta(p: ProductoImagen, opciones: OpcionesImagen, familia = FAMILIA_RESPALDO): HTMLCanvasElement {
  const { ancho: W, alto: H } = MEDIDAS_IMAGEN[opciones.formato];
  const t = temaCartel(opciones.tema);
  // 1em del cartel en pixeles: el cartel entero (40 x 56.5 em) entra en la imagen.
  // En la historia sobra alto y en la cuadrada sobra ancho: el medio se estira, como en pantalla.
  const em = Math.min(W / CARTEL_ANCHO, H / CARTEL_ALTO);
  const fuente = (tamPx: number, peso: number, italica = false) => `${italica ? "italic " : ""}${peso} ${tamPx}px ${familia}`;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite dibujar la imagen");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const a = analizarOferta(p);
  const etiqueta = etiquetaOferta(p);
  const esCombo = p.ofertaTipo === "combo";
  const porKg = p.unidad === "kg" ? "/kg" : "";
  const precioGrande = pesos(a.totalPromo);

  // Hoja blanca con borde del color del tema
  const borde = 0.4 * em;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = t.principal;
  ctx.fillRect(0, 0, W, borde);
  ctx.fillRect(0, H - borde, W, borde);
  ctx.fillRect(0, 0, borde, H);
  ctx.fillRect(W - borde, 0, borde, H);
  const interiorX = borde;
  const interiorW = W - borde * 2;
  const relleno = 2 * em;
  const anchoUtil = interiorW - relleno * 2;

  // Franja del titulo
  const tamTitulo = tamanoTitulo(t.titulo, 36, 7) * em;
  const altoFranja = 1.2 * em + tamTitulo + 1 * em;
  ctx.fillRect(interiorX, borde, interiorW, altoFranja);
  ctx.font = fuente(tamTitulo, 900, true);
  const anchoTitulo = ctx.measureText(t.titulo).width;
  const tamTituloReal = anchoTitulo > interiorW * 0.94 ? tamTitulo * ((interiorW * 0.94) / anchoTitulo) : tamTitulo;
  ctx.fillStyle = "#ffffff";
  ctx.font = fuente(tamTituloReal, 900, true);
  ctx.textBaseline = "middle";
  ctx.fillText(t.titulo, W / 2, borde + 1.2 * em + tamTitulo / 2);

  // Pie: linea punteada, comercio a la izquierda y vigencia a la derecha
  const tamPie = 1.4 * em;
  const altoPie = 0.9 * em * 2 + tamPie * 1.2;
  const yPie = H - borde - altoPie;
  ctx.strokeStyle = t.principal;
  ctx.lineWidth = 0.15 * em;
  ctx.setLineDash([0.45 * em, 0.3 * em]);
  ctx.beginPath();
  ctx.moveTo(interiorX, yPie);
  ctx.lineTo(interiorX + interiorW, yPie);
  ctx.stroke();
  ctx.setLineDash([]);
  const vigencia = textoVigencia(p.ofertaDesde, p.ofertaHasta);
  const yTextoPie = yPie + altoPie / 2;
  ctx.textAlign = "right";
  ctx.font = fuente(tamPie, p.ofertaHasta ? 800 : 600);
  ctx.fillStyle = p.ofertaHasta ? t.principal : "#555555";
  ctx.fillText(vigencia, interiorX + interiorW - relleno, yTextoPie);
  const anchoVigencia = ctx.measureText(vigencia).width;
  if (opciones.comercio) {
    ctx.textAlign = "left";
    ctx.font = fuente(tamPie, 600);
    ctx.fillStyle = "#111111";
    ctx.fillText(recortar(ctx, opciones.comercio, anchoUtil - anchoVigencia - em), interiorX + relleno, yTextoPie);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Medio: los bloques repartidos parejo (space-evenly) entre la franja y el pie
  const arriba = borde + altoFranja + 1.5 * em;
  const abajo = yPie - 1.5 * em;

  const bloqueBadge = (e: number): Bloque | null => {
    if (!etiqueta) return null;
    let tam = emAjustado(etiqueta.length, 30, esCombo ? 8 : 6) * e;
    ctx.font = fuente(tam, 900);
    const maxTexto = anchoUtil * 0.92 - 0.56 * tam;
    const medido = ctx.measureText(etiqueta).width;
    if (medido > maxTexto) tam *= maxTexto / medido;
    ctx.font = fuente(tam, 900);
    const w = ctx.measureText(etiqueta).width + 0.56 * tam;
    const h = tam * 1.05 + 0.12 * tam;
    // Al girar, las puntas del badge suben y bajan: se reserva ese espacio
    const giro = Math.abs(Math.sin(GIRO_BADGE)) * w;
    return {
      alto: h + giro,
      dibujar: (y) => {
        ctx.save();
        ctx.translate(W / 2, y + (h + giro) / 2);
        ctx.rotate(GIRO_BADGE);
        const sombra = 0.05 * tam;
        ctx.fillStyle = t.profundo;
        rectRedondo(ctx, -w / 2 + sombra, -h / 2 + sombra, w, h, 0.18 * tam);
        ctx.fill();
        ctx.fillStyle = t.badgeFondo;
        rectRedondo(ctx, -w / 2, -h / 2, w, h, 0.18 * tam);
        ctx.fill();
        ctx.fillStyle = t.badgeTexto;
        ctx.font = fuente(tam, 900);
        ctx.textBaseline = "middle";
        ctx.fillText(etiqueta, 0, tam * 0.04);
        ctx.restore();
      },
    };
  };

  const bloqueNombre = (e: number): Bloque => {
    const tam = (p.name.length > 40 ? 2.2 : 2.8) * e;
    ctx.font = fuente(tam, 800);
    const lineas = partir(ctx, p.name.toUpperCase(), anchoUtil, 3);
    return {
      alto: lineas.length * tam * 1.1,
      dibujar: (y) => {
        ctx.font = fuente(tam, 800);
        ctx.fillStyle = "#111111";
        ctx.textBaseline = "middle";
        lineas.forEach((l, i) => ctx.fillText(l, W / 2, y + tam * 1.1 * (i + 0.5)));
        ctx.textBaseline = "alphabetic";
      },
    };
  };

  // Precio: tachado (o "Llevando N") + precio grande (+ "c/u" en combos)
  const bloquePrecio = (e: number): Bloque => {
    const tamAntes = (esCombo ? 2.4 : 2.6) * e;
    const antes = esCombo ? `Llevando ${a.unidades}` : `${pesos(p.price)}${porKg}`;
    let tamPrecio = emAjustado(precioGrande.length + porKg.length, 36, 11) * e;
    const anchoDe = (tam: number) => {
      ctx.font = fuente(tam * 0.35, 700);
      const kg = porKg ? ctx.measureText(porKg).width : 0;
      ctx.font = fuente(tam, 900);
      return { numero: ctx.measureText(precioGrande).width, total: ctx.measureText(precioGrande).width + kg };
    };
    let medida = anchoDe(tamPrecio);
    if (medida.total > anchoUtil) {
      tamPrecio *= anchoUtil / medida.total;
      medida = anchoDe(tamPrecio);
    }
    const tamCu = 1.8 * e;
    const textoCu = `${pesos(a.precioUnitario)} c/u · antes ${pesos(p.price)} c/u`;
    return {
      alto: tamAntes + 0.05 * tamPrecio + tamPrecio + (esCombo ? 1.3 * tamCu : 0),
      dibujar: (y) => {
        ctx.textBaseline = "middle";
        const yAntes = y + tamAntes / 2;
        ctx.font = fuente(tamAntes, esCombo ? 700 : 400);
        ctx.fillStyle = esCombo ? "#111111" : "#666666";
        ctx.fillText(antes, W / 2, yAntes);
        if (!esCombo) {
          const w = ctx.measureText(antes).width;
          ctx.strokeStyle = t.principal;
          ctx.lineWidth = 0.1 * tamAntes;
          ctx.beginPath();
          ctx.moveTo(W / 2 - w / 2, yAntes);
          ctx.lineTo(W / 2 + w / 2, yAntes);
          ctx.stroke();
        }
        const yPrecio = y + tamAntes + 0.05 * tamPrecio + tamPrecio / 2;
        const x0 = W / 2 - medida.total / 2;
        ctx.textAlign = "left";
        ctx.font = fuente(tamPrecio, 900);
        ctx.fillStyle = "#111111";
        ctx.fillText(precioGrande, x0, yPrecio);
        if (porKg) {
          ctx.font = fuente(tamPrecio * 0.35, 700);
          ctx.textBaseline = "alphabetic";
          ctx.fillText(porKg, x0 + medida.numero, yPrecio + tamPrecio * 0.36);
        }
        ctx.textAlign = "center";
        if (esCombo) {
          ctx.font = fuente(tamCu, 400);
          ctx.fillStyle = "#444444";
          ctx.textBaseline = "middle";
          ctx.fillText(textoCu, W / 2, y + tamAntes + 1.05 * tamPrecio + 0.8 * tamCu);
        }
        ctx.textBaseline = "alphabetic";
      },
    };
  };

  const bloqueAhorro = (e: number): Bloque | null => {
    if (a.ahorroTotal <= 0) return null;
    const texto = `Ahorrás ${pesos(a.ahorroTotal)}`;
    const tam = 2.2 * e;
    ctx.font = fuente(tam, 800);
    const w = ctx.measureText(texto).width + 2.4 * tam;
    const h = tam * 1.2 + 0.7 * tam;
    return {
      alto: h,
      dibujar: (y) => {
        ctx.fillStyle = VERDE;
        rectRedondo(ctx, W / 2 - w / 2, y, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = fuente(tam, 800);
        ctx.textBaseline = "middle";
        ctx.fillText(texto, W / 2, y + h / 2);
        ctx.textBaseline = "alphabetic";
      },
    };
  };

  const armarBloques = (e: number): Bloque[] =>
    [bloqueBadge(e), bloqueNombre(e), bloquePrecio(e), bloqueAhorro(e)].filter((b): b is Bloque => b !== null);

  // Si no entra (nombre muy largo en la cuadrada), se achica el medio de a poco
  const altoDe = (bs: Bloque[]) => bs.reduce((s, b) => s + b.alto, 0);
  let e = em;
  let bloques = armarBloques(e);
  while (altoDe(bloques) > abajo - arriba && e > em * 0.5) {
    e *= 0.92;
    bloques = armarBloques(e);
  }
  const hueco = Math.max(0, (abajo - arriba - altoDe(bloques)) / (bloques.length + 1));
  let y = arriba + hueco;
  for (const b of bloques) {
    b.dibujar(y);
    y += b.alto + hueco;
  }

  return canvas;
}

/** Espera la letra de la app antes de dibujar: si no, el canvas usa otra y no coincide con lo que se ve. */
async function familiaLista(): Promise<string> {
  const familia = familiaDeLaApp();
  try {
    await Promise.all([
      ...[400, 600, 700, 800, 900].map((peso) => document.fonts.load(`${peso} 40px ${familia}`)),
      document.fonts.load(`italic 900 40px ${familia}`),
    ]);
  } catch {
    // sin Font Loading API: se dibuja con la que haya
  }
  return familia;
}

export async function generarImagenOferta(p: ProductoImagen, opciones: OpcionesImagen): Promise<Blob> {
  const canvas = dibujarImagenOferta(p, opciones, await familiaLista());
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
  });
}
