// lib/server/backup.ts — arma el Excel con TODOS los datos de un comercio (server-only).
//
// Que hojas y columnas van: lib/backup-hojas.ts. Se piden a la base solo esas
// columnas (nunca "*"), asi un secreto como pin_hash ni siquiera se lee.
// Se lee de a paginas (lib/server/leer-todo.ts): PostgREST corta en 1000 por
// consulta y un supermercado tiene muchas mas ventas que eso.
import * as XLSX from "xlsx-js-style";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { leerTodo } from "@/lib/server/leer-todo";
import {
  HOJAS, filasDeHoja, filasDetalleVentas, nombreArchivoBackup, valorCelda, type Celda, type Hoja,
} from "@/lib/backup-hojas";

const ESTILO_TITULO = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "0F766E" } },
  alignment: { vertical: "center" },
};

async function leerTabla(tabla: string, comercioId: string, columnas: string[], orden: string): Promise<Record<string, any>[]> {
  try {
    return await leerTodo<Record<string, any>>((desde, hasta) =>
      supabaseAdmin
        .from(tabla)
        .select(columnas.join(", "))
        .eq("comercio_id", comercioId)
        .order(orden, { ascending: true })
        .order(columnas.includes("id") ? "id" : orden, { ascending: true }) // desempate estable entre paginas
        .range(desde, hasta) as unknown as PromiseLike<{ data: Record<string, any>[] | null; error: { message: string } | null }>,
    );
  } catch (e) {
    throw new Error(`No se pudo leer ${tabla}: ${e instanceof Error ? e.message : e}`);
  }
}

function hojaExcel(filas: Celda[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const titulos = filas[0] ?? [];
  // Titulos con estilo y ancho de columna segun el contenido (con tope).
  titulos.forEach((_, i) => {
    const celda = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (celda) celda.s = ESTILO_TITULO;
  });
  ws["!cols"] = titulos.map((_, i) => {
    let ancho = 8;
    for (let r = 0; r < Math.min(filas.length, 200); r++) ancho = Math.max(ancho, String(filas[r][i] ?? "").length + 2);
    return { wch: Math.min(ancho, 45) };
  });
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

export interface Backup {
  archivo: Buffer;
  nombre: string;
}

export async function generarBackup(comercioId: string): Promise<Backup> {
  const { data: comercio, error } = await supabaseAdmin
    .from("comercios")
    .select("nombre, slug, estado, plan, trial_hasta, created_at")
    .eq("id", comercioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!comercio) throw new Error("Comercio inexistente");

  // Las ventas se leen con items (jsonb) para armar tambien "Detalle de ventas".
  const leer = (h: Hoja) => {
    const columnas = h.columnas.map((c) => c.campo);
    if (h.tabla === "ventas") columnas.push("items");
    return leerTabla(h.tabla, comercioId, columnas, h.orden);
  };
  const datos = await Promise.all(HOJAS.map(leer));

  const libro = XLSX.utils.book_new();
  const resumen: Celda[][] = [
    ["Backup de", comercio.nombre],
    ["Dirección del panel", `/${comercio.slug}`],
    ["Generado", valorCelda(new Date().toISOString(), "fecha")],
    ["Estado", comercio.estado],
    ["Plan", comercio.plan],
    ["Alta del comercio", valorCelda(comercio.created_at, "fecha")],
    [],
    ["Hoja", "Registros"],
  ];

  const hojas: [string, Celda[][]][] = [];
  HOJAS.forEach((h, i) => {
    hojas.push([h.nombre, filasDeHoja(h, datos[i])]);
    if (h.tabla === "ventas") hojas.push(["Detalle de ventas", filasDetalleVentas(datos[i])]);
  });
  for (const [nombre, filas] of hojas) resumen.push([nombre, filas.length - 1]);

  XLSX.utils.book_append_sheet(libro, hojaExcel(resumen), "Resumen");
  for (const [nombre, filas] of hojas) XLSX.utils.book_append_sheet(libro, hojaExcel(filas), nombre);

  const archivo = XLSX.write(libro, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  return { archivo, nombre: nombreArchivoBackup(comercio.slug) };
}

/** Respuesta HTTP de descarga del Excel. */
export function respuestaBackup({ archivo, nombre }: Backup): Response {
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
