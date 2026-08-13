// lib/server/importar-productos.ts — alta/actualizacion masiva desde Excel
// (server-only, service role). El parseo del archivo sigue en el navegador;
// lo que se movio aca son las escrituras, que antes iban con el anon key.
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface FilaImportacion {
  barra: string;
  codigo: string;
  descripcion: string;
  precio: number;
  costo?: number;
  rubro: string;
  subrubro: string;
  stock: number;
  lote?: number;
  warnings: string[];
}

export type EstrategiaStock = "reemplazar" | "sumar" | "mantener" | "solo_nuevos";

export interface ResumenImportacion {
  creados: number;
  actualizados: number;
  omitidos: number;
  conAdvertencias: number;
}

function aCategoria(rubro: string, subrubro: string): string {
  if (rubro && subrubro) return `${rubro} / ${subrubro}`;
  return rubro || subrubro || "";
}

interface ProductoExistente {
  id: string;
  name: string;
  price: number;
  precio_base: number | null;
  category: string;
  codigo: string | null;
  codigo_barras: string | null;
  stock: number;
  lote: number | null;
}

const COLUMNAS = "id,name,price,precio_base,category,codigo,codigo_barras,stock,lote";

async function buscarExistente(
  fila: FilaImportacion,
  comercioId: string,
): Promise<ProductoExistente | null> {
  if (fila.barra) {
    const { data } = await supabaseAdmin
      .from("productos")
      .select(COLUMNAS)
      .eq("comercio_id", comercioId)
      .eq("codigo_barras", fila.barra)
      .limit(1)
      .maybeSingle();
    if (data) return data as ProductoExistente;
  }
  if (fila.codigo) {
    const { data } = await supabaseAdmin
      .from("productos")
      .select(COLUMNAS)
      .eq("comercio_id", comercioId)
      .eq("codigo", fila.codigo)
      .limit(1)
      .maybeSingle();
    if (data) return data as ProductoExistente;
  }
  return null;
}

async function importarFila(
  fila: FilaImportacion,
  comercioId: string,
  estrategia: EstrategiaStock,
  resumen: ResumenImportacion,
): Promise<void> {
  const revisar = (fila.warnings ?? []).length > 0;
  if (revisar) resumen.conAdvertencias++;

  const existente = await buscarExistente(fila, comercioId);
  const categoria = aCategoria(fila.rubro, fila.subrubro);

  if (existente) {
    if (estrategia === "solo_nuevos") return;

    const stock =
      estrategia === "reemplazar"
        ? fila.stock
        : estrategia === "sumar"
          ? Number(existente.stock) + fila.stock
          : Number(existente.stock);

    const precioAnterior = Number(existente.price) || 0;
    const nuevoPrecio = fila.precio || precioAnterior;

    const { error } = await supabaseAdmin
      .from("productos")
      .update({
        name: fila.descripcion || existente.name,
        price: nuevoPrecio,
        precio_base: fila.costo ?? existente.precio_base ?? null,
        category: categoria || existente.category,
        codigo: fila.codigo || existente.codigo,
        codigo_barras: fila.barra || existente.codigo_barras,
        stock,
        lote: fila.lote ?? existente.lote ?? null,
        revisar,
      })
      .eq("comercio_id", comercioId)
      .eq("id", existente.id);
    if (error) throw new Error(error.message);

    if (nuevoPrecio !== precioAnterior) {
      await supabaseAdmin.from("producto_auditoria").insert({
        id: crypto.randomUUID(),
        comercio_id: comercioId,
        producto_id: existente.id,
        campo: "price",
        valor_anterior: String(precioAnterior),
        valor_nuevo: String(nuevoPrecio),
        usuario_nombre: "Importación Excel",
      });
    }
    resumen.actualizados++;
    return;
  }

  const { error } = await supabaseAdmin.from("productos").insert({
    id: crypto.randomUUID(),
    comercio_id: comercioId,
    codigo: fila.codigo || null,
    codigo_barras: fila.barra || null,
    name: fila.descripcion,
    description: "",
    price: fila.precio,
    precio_base: fila.costo ?? null,
    category: categoria,
    image_url: "",
    stock: fila.stock,
    stock_minimo: 0,
    lote: fila.lote ?? null,
    revisar,
    disabled: false,
  });
  if (error) throw new Error(error.message);
  resumen.creados++;
}

/** Procesa un lote de filas ya filtradas por el cliente. */
export async function importarLote(
  filas: FilaImportacion[],
  comercioId: string,
  estrategia: EstrategiaStock,
): Promise<ResumenImportacion> {
  const resumen: ResumenImportacion = {
    creados: 0,
    actualizados: 0,
    omitidos: 0,
    conAdvertencias: 0,
  };

  // De a 25 en paralelo, igual que la version que corria en el navegador.
  const CONCURRENCIA = 25;
  for (let i = 0; i < filas.length; i += CONCURRENCIA) {
    const tanda = filas.slice(i, i + CONCURRENCIA);
    await Promise.all(tanda.map((f) => importarFila(f, comercioId, estrategia, resumen)));
  }

  return resumen;
}
