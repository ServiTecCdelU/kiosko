// lib/pedir-mas.ts — "Pedí más: se vende bien". Detecta los productos que se
// venden rapido (o mas rapido que antes) y sugiere cuanto pedir para no quedarse
// sin stock. Puro: sin React ni Supabase, testeado con node:test.
//
// La base no guarda "bultos": se usa la ultima compra como tamaño del pedido
// (si compraste 20, sugiere de a 20).

export interface UltimaCompra {
  /** ISO de cuando se recibio. */
  fecha: string;
  cantidad: number;
  /** Lo vendido desde esa compra. */
  vendidoDesde: number;
}

export interface RitmoProducto {
  id: string;
  nombre: string;
  unidad: "un" | "kg";
  stock: number;
  stockMinimo: number;
  /** Vendido en los ultimos `dias`. */
  vendidoReciente: number;
  /** Vendido en los `dias` anteriores a esos. */
  vendidoAnterior: number;
  ultimaCompra: UltimaCompra | null;
}

/**
 * acelera: vende bastante mas que en el periodo anterior.
 * compra-rapida: ya vendio buena parte de la ultima compra en pocos dias.
 * se-agota: al ritmo actual el stock no dura una semana.
 */
export type MotivoPedido = "acelera" | "compra-rapida" | "se-agota";

/**
 * ahora: al ritmo actual no llega a cubrir las 2 semanas, hay que pedir ya.
 * proxima: todavia tiene stock, pero se vende mejor que lo que venias comprando:
 * cuando repongas, pedi mas que la ultima vez.
 */
export type CuandoPedir = "ahora" | "proxima";

export interface SugerenciaPedido {
  producto: RitmoProducto;
  cuando: CuandoPedir;
  motivos: MotivoPedido[];
  /** Unidades (o kg) por dia en el periodo reciente. */
  ritmoDiario: number;
  /** % de cambio del ritmo contra el periodo anterior; null si antes no se vendia. */
  cambioPct: number | null;
  /** Dias que dura el stock al ritmo actual. */
  diasDeStock: number;
  /** Dias desde la ultima compra (0 = hoy). */
  diasDesdeCompra: number | null;
  /** Cuanto pedir (ya redondeado a multiplos de la ultima compra si la hay). En "proxima", el tamaño del proximo pedido. */
  cantidad: number;
  /** Cuantas veces la ultima compra es `cantidad`; null si no hay compra de referencia. */
  vecesUltimaCompra: number | null;
}

/** Cuantos dias de venta tiene que cubrir el pedido. */
export const DIAS_COBERTURA = 14;
/** Vende al menos un 30% mas que antes para contar como "acelera". */
export const UMBRAL_ACELERA = 1.3;
/** Ya se vendio al menos el 60% de la ultima compra... */
export const PCT_COMPRA_RAPIDA = 0.6;
/** ...dentro de estos dias. */
export const DIAS_COMPRA_RAPIDA = 21;
/** Stock para menos de esto = se agota. */
export const DIAS_SE_AGOTA = 7;
/** Por debajo de esto lo vendido es ruido (unidades / kg en el periodo). */
const MINIMO_VENDIDO = { un: 5, kg: 2 } as const;

const DIA_MS = 86_400_000;

function redondearArriba(n: number, unidad: "un" | "kg"): number {
  // kg de a medio kilo; unidades enteras
  return unidad === "kg" ? Math.ceil(n * 2) / 2 : Math.ceil(n - 1e-9);
}

/** Analiza un producto; null si no hace falta pedir. */
export function analizarPedido(p: RitmoProducto, dias: number, ahora: Date, cobertura = DIAS_COBERTURA): SugerenciaPedido | null {
  if (dias <= 0 || p.vendidoReciente < MINIMO_VENDIDO[p.unidad]) return null;

  const ritmoDiario = p.vendidoReciente / dias;
  const ritmoAnterior = p.vendidoAnterior / dias;
  const stock = Math.max(0, p.stock);
  const diasDeStock = stock / ritmoDiario;
  const cambioPct = ritmoAnterior > 0 ? Math.round((ritmoDiario / ritmoAnterior - 1) * 100) : null;

  const motivos: MotivoPedido[] = [];
  if (ritmoAnterior > 0 && ritmoDiario >= ritmoAnterior * UMBRAL_ACELERA) motivos.push("acelera");

  let diasDesdeCompra: number | null = null;
  const compra = p.ultimaCompra && p.ultimaCompra.cantidad > 0 ? p.ultimaCompra : null;
  if (compra) {
    const desde = Date.parse(compra.fecha);
    if (Number.isFinite(desde)) {
      diasDesdeCompra = Math.max(0, Math.floor((ahora.getTime() - desde) / DIA_MS));
      if (diasDesdeCompra <= DIAS_COMPRA_RAPIDA && compra.vendidoDesde >= compra.cantidad * PCT_COMPRA_RAPIDA) {
        motivos.push("compra-rapida");
      }
    }
  }
  if (diasDeStock < DIAS_SE_AGOTA) motivos.push("se-agota");
  if (motivos.length === 0) return null;

  // Que alcance para `cobertura` dias y no quede por debajo del minimo
  const objetivo = Math.max(ritmoDiario * cobertura, p.stockMinimo);
  const falta = objetivo - stock;
  const ventaCobertura = ritmoDiario * cobertura;
  const vendeBien = motivos.includes("acelera") || motivos.includes("compra-rapida");

  let cuando: CuandoPedir;
  let base: number;
  if (falta > 0) {
    cuando = "ahora";
    base = falta;
  } else if (compra && vendeBien && ventaCobertura > compra.cantidad) {
    // Hay stock, pero lo que compras por vez ya no alcanza para 2 semanas de venta
    cuando = "proxima";
    base = ventaCobertura;
  } else {
    return null;
  }

  let cantidad = redondearArriba(base, p.unidad);
  let vecesUltimaCompra: number | null = null;
  if (compra) {
    vecesUltimaCompra = Math.ceil(base / compra.cantidad - 1e-9);
    cantidad = vecesUltimaCompra * compra.cantidad;
  }

  return { producto: p, cuando, motivos, ritmoDiario, cambioPct, diasDeStock, diasDesdeCompra, cantidad, vecesUltimaCompra };
}

/** Todos los que conviene pedir: primero los de pedir ya, y dentro de cada grupo lo que se agota antes. */
export function sugerirPedidos(productos: RitmoProducto[], dias: number, ahora: Date, cobertura = DIAS_COBERTURA): SugerenciaPedido[] {
  return productos
    .map((p) => analizarPedido(p, dias, ahora, cobertura))
    .filter((s): s is SugerenciaPedido => s !== null)
    .sort((a, b) =>
      (a.cuando === b.cuando ? 0 : a.cuando === "ahora" ? -1 : 1) ||
      a.diasDeStock - b.diasDeStock ||
      (b.cambioPct ?? 0) - (a.cambioPct ?? 0));
}

function cantidadTexto(n: number, unidad: "un" | "kg"): string {
  const num = n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return unidad === "kg" ? `${num} kg` : `${num} u.`;
}

/** Por que se sugiere, en castellano de mostrador. */
export function explicarPedido(s: SugerenciaPedido): string[] {
  const p = s.producto;
  const textos: string[] = [];
  if (s.motivos.includes("compra-rapida") && p.ultimaCompra) {
    const cuando = s.diasDesdeCompra === 0 ? "hoy" : s.diasDesdeCompra === 1 ? "ayer" : `hace ${s.diasDesdeCompra} días`;
    const { cantidad, vendidoDesde } = p.ultimaCompra;
    textos.push(
      vendidoDesde >= cantidad
        ? `Desde que compraste ${cantidadTexto(cantidad, p.unidad)} ${cuando} ya vendiste ${cantidadTexto(vendidoDesde, p.unidad)}: más de lo que compraste`
        : `De los ${cantidadTexto(cantidad, p.unidad)} que compraste ${cuando} ya vendiste ${cantidadTexto(vendidoDesde, p.unidad)} (${Math.round((vendidoDesde / cantidad) * 100)}%)`,
    );
  }
  if (s.motivos.includes("acelera") && s.cambioPct != null) {
    textos.push(`Se vende un ${s.cambioPct}% más rápido que las 2 semanas anteriores`);
  }
  if (s.cuando === "proxima") {
    textos.push(`Te alcanza para ${Math.floor(s.diasDeStock)} días, pero lo que comprás por vez se queda corto`);
  }
  if (s.motivos.includes("se-agota")) {
    const d = Math.floor(s.diasDeStock);
    textos.push(d <= 0 ? "Al ritmo de hoy ya te quedaste sin stock" : `Al ritmo de hoy te alcanza para ${d} día${d === 1 ? "" : "s"}`);
  }
  return textos;
}

/** Texto del pedido para mandarle al proveedor (WhatsApp o copiar). */
export function textoPedido(sugerencias: SugerenciaPedido[], comercio?: string): string {
  const lineas = sugerencias.map((s) => `• ${s.producto.nombre}: ${cantidadTexto(s.cantidad, s.producto.unidad)}`);
  return [`Pedido${comercio ? ` de ${comercio}` : ""}:`, ...lineas].join("\n");
}

export { cantidadTexto };
