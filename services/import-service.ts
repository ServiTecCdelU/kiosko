import { apiUrl } from "@/lib/utils/api-url"
// services/import-service.ts — importación masiva de productos desde lista de precios (Excel o CSV)
import * as XLSX from "xlsx-js-style";
import { indexToLetter, letterToIndex, parsearNumero } from "@/lib/importar-filas";

export { indexToLetter, letterToIndex };

export type ImportField =
  | "barra"
  | "codigo"
  | "descripcion"
  | "precio"
  | "costo"
  | "rubro"
  | "subrubro"
  | "stock"
  | "lote";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  barra: "Código de barra",
  codigo: "Código",
  descripcion: "Descripción",
  precio: "Precio (Cons. Final)",
  costo: "Costo (opcional, para margen)",
  rubro: "Rubro",
  subrubro: "Subrubro",
  stock: "Stock",
  lote: "Lote (unidades por paquete)",
};

// El mapeo usa la letra de columna de Excel (A, B, C...), no el texto del encabezado
// (muchas listas de precios no traen encabezados reales, o los repiten/dejan vacíos).
export type ColumnMapping = Partial<Record<ImportField, string>>;

export interface SheetPreview {
  columnLetters: string[];
  sampleRows: string[][];
}

export function readRawRows(workbook: XLSX.WorkBook): string[][] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
}

export const EXTENSIONES_PLANILLA = ".xlsx,.xls,.csv,.txt";

function esCsv(file: File): boolean {
  return /\.(csv|txt)$/i.test(file.name) || file.type === "text/csv" || file.type === "text/plain";
}

/** Un CSV guardado desde Excel suele venir en Windows-1252; si no es UTF-8 valido se decodifica asi. */
function decodificarTexto(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** Lee un Excel (.xlsx/.xls) o un CSV (coma, punto y coma o tabulacion; lo detecta solo). */
export async function readSheet(file: File): Promise<{ workbook: XLSX.WorkBook; preview: SheetPreview }> {
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    throw new Error("No se pudo leer el archivo");
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = esCsv(file)
      ? XLSX.read(decodificarTexto(buf).replace(/^﻿/, ""), { type: "string", raw: true })
      : XLSX.read(new Uint8Array(buf), { type: "array" });
  } catch {
    throw new Error("El archivo no parece ser un Excel ni un CSV válido");
  }
  const rows = readRawRows(workbook);
  if (rows.length === 0) throw new Error("El archivo está vacío");
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const columnLetters = Array.from({ length: columnCount }, (_, i) => indexToLetter(i));
  const sampleRows = rows.slice(0, 5).map((r) => r.map((c) => String(c ?? "")));
  return { workbook, preview: { columnLetters, sampleRows } };
}

/**
 * Descarga una plantilla con los encabezados y una fila de ejemplo, en Excel o
 * en CSV (separado por punto y coma, con BOM, como lo abre Excel en Argentina).
 */
export function descargarPlantilla(nombre: string, encabezados: string[], ejemplo: (string | number)[], formato: "xlsx" | "csv"): void {
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
  hoja["!cols"] = encabezados.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  if (formato === "xlsx") {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Datos");
    XLSX.writeFile(libro, `${nombre}.xlsx`);
    return;
  }
  const csv = XLSX.utils.sheet_to_csv(hoja, { FS: ";" });
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const AUTO_MATCH: Record<ImportField, RegExp> = {
  barra: /barra|c[oó]digo.*barra|ean/i,
  codigo: /^c[oó]digo$|cod\.?$|sku/i,
  descripcion: /descrip|nombre|producto/i,
  precio: /precio|cons\.?\s*final|pvp/i,
  costo: /costo|compra|neto/i,
  rubro: /rubro|categor/i,
  subrubro: /subrubro|sub.?categor/i,
  stock: /stock|cantidad|existencia/i,
  lote: /lote|paquete|bulto/i,
};

/** Intenta adivinar el mapeo mirando la primera fila (por si trae encabezados reales). */
export function guessMappingFromHeaders(headerRow: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  (Object.keys(AUTO_MATCH) as ImportField[]).forEach((field) => {
    const idx = headerRow.findIndex((h) => AUTO_MATCH[field].test(String(h ?? "")));
    if (idx >= 0) mapping[field] = indexToLetter(idx);
  });
  return mapping;
}

const STORAGE_KEY = "kiosko:import-mapping-v1";

export interface SavedImportConfig {
  mapping: ColumnMapping;
  startRow: number;
}

export function loadSavedMapping(): SavedImportConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedImportConfig) : null;
  } catch {
    return null;
  }
}

export function saveMapping(config: SavedImportConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // almacenamiento no disponible, no es crítico
  }
}

export interface ParsedRow {
  rowNumber: number;
  barra: string;
  codigo: string;
  descripcion: string;
  precio: number;
  costo: number | undefined;
  rubro: string;
  subrubro: string;
  stock: number;
  lote: number | undefined;
  warnings: string[];
}

export function parseRows(
  workbook: XLSX.WorkBook,
  mapping: ColumnMapping,
  startRow: number,
): ParsedRow[] {
  const rows = readRawRows(workbook);

  const idx = {
    barra: letterToIndex(mapping.barra),
    codigo: letterToIndex(mapping.codigo),
    descripcion: letterToIndex(mapping.descripcion),
    precio: letterToIndex(mapping.precio),
    costo: letterToIndex(mapping.costo),
    rubro: letterToIndex(mapping.rubro),
    subrubro: letterToIndex(mapping.subrubro),
    stock: letterToIndex(mapping.stock),
    lote: letterToIndex(mapping.lote),
  };

  const dataRows = rows.slice(startRow - 1);
  const parsed: ParsedRow[] = [];

  dataRows.forEach((r, i) => {
    if (r.every((c) => String(c ?? "").trim() === "")) return;

    const get = (i2: number) => (i2 >= 0 ? String(r[i2] ?? "").trim() : "");
    const barra = get(idx.barra);
    const codigo = get(idx.codigo);
    const descripcion = get(idx.descripcion);
    // Numeros como vienen en las listas argentinas: "1.500,50", "$ 1.500", "12,5".
    const precio = parsearNumero(get(idx.precio)) ?? 0;
    const costo = parsearNumero(get(idx.costo)) ?? undefined;
    const rubro = get(idx.rubro);
    const subrubro = get(idx.subrubro);
    const stock = parsearNumero(get(idx.stock)) ?? 0;
    const loteRaw = get(idx.lote).replace(/[^\d]/g, "");
    const lote = loteRaw ? Number(loteRaw) : undefined;

    if (!descripcion && !barra && !codigo) return;

    const warnings: string[] = [];
    if (precio <= 0) warnings.push("precio en cero");
    if (!barra && !codigo) warnings.push("sin código");
    if (!rubro) warnings.push("sin rubro");
    if (!descripcion) warnings.push("sin descripción");

    parsed.push({
      rowNumber: startRow + i,
      barra,
      codigo,
      descripcion,
      precio,
      costo,
      rubro,
      subrubro,
      stock,
      lote,
      warnings,
    });
  });

  return parsed;
}

export type StockStrategy = "no_tocar" | "reemplazar" | "sumar" | "solo_nuevos";

export interface ImportOptions {
  stockStrategy: StockStrategy;
  incluirConAdvertencias: boolean;
}

export interface ImportSummary {
  creados: number;
  actualizados: number;
  omitidos: number;
  conAdvertencias: number;
}

export async function importProducts(
  rows: ParsedRow[],
  options: ImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = { creados: 0, actualizados: 0, omitidos: 0, conAdvertencias: 0 };

  const usable = rows.filter((r) => {
    if (r.warnings.length > 0 && !options.incluirConAdvertencias) {
      summary.omitidos++;
      return false;
    }
    return true;
  });

  // Las escrituras ocurren en el servidor. Se manda por lotes para no pasarse
  // del limite de tamaño de request ni del tiempo maximo de la funcion.
  const TAMANIO_LOTE = 200;
  for (let i = 0; i < usable.length; i += TAMANIO_LOTE) {
    const lote = usable.slice(i, i + TAMANIO_LOTE);
    const res = await fetch(apiUrl("/api/productos/importar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filas: lote,
        estrategia: options.stockStrategy,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "No se pudo importar");

    summary.creados += data.creados ?? 0;
    summary.actualizados += data.actualizados ?? 0;
    summary.conAdvertencias += data.conAdvertencias ?? 0;

    onProgress?.(Math.min(i + TAMANIO_LOTE, usable.length), usable.length);
  }

  return summary;
}
