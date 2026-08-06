// services/import-service.ts — importación masiva de productos desde lista de precios (Excel)
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";
import { mapRow } from "@/services/products-service";
import type { Product } from "@/lib/types";

export type ImportField =
  | "barra"
  | "codigo"
  | "descripcion"
  | "precio"
  | "rubro"
  | "subrubro"
  | "stock"
  | "lote";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  barra: "Código de barra",
  codigo: "Código",
  descripcion: "Descripción",
  precio: "Precio (Cons. Final)",
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

function indexToLetter(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function readRawRows(workbook: XLSX.WorkBook): string[][] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
}

export function readSheet(file: File): Promise<{ workbook: XLSX.WorkBook; preview: SheetPreview }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const rows = readRawRows(workbook);
        const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
        const columnLetters = Array.from({ length: columnCount }, (_, i) => indexToLetter(i));
        const sampleRows = rows.slice(0, 5).map((r) => r.map((c) => String(c ?? "")));
        resolve({ workbook, preview: { columnLetters, sampleRows } });
      } catch {
        reject(new Error("El archivo no parece ser un Excel válido"));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

const AUTO_MATCH: Record<ImportField, RegExp> = {
  barra: /barra|c[oó]digo.*barra|ean/i,
  codigo: /^c[oó]digo$|cod\.?$|sku/i,
  descripcion: /descrip|nombre|producto/i,
  precio: /precio|cons\.?\s*final|pvp/i,
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
  rubro: string;
  subrubro: string;
  stock: number;
  lote: number | undefined;
  warnings: string[];
}

function letterToIndex(letter?: string): number {
  if (!letter) return -1;
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
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
    const precioRaw = get(idx.precio).replace(/[^\d,.-]/g, "").replace(",", ".");
    const precio = Number(precioRaw) || 0;
    const rubro = get(idx.rubro);
    const subrubro = get(idx.subrubro);
    const stockRaw = get(idx.stock).replace(/[^\d.-]/g, "");
    const stock = Number(stockRaw) || 0;
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

function toCategory(rubro: string, subrubro: string): string {
  if (rubro && subrubro) return `${rubro} / ${subrubro}`;
  return rubro || subrubro || "";
}

export async function importProducts(
  rows: ParsedRow[],
  options: ImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const comercioId = getComercioId();
  const summary: ImportSummary = { creados: 0, actualizados: 0, omitidos: 0, conAdvertencias: 0 };

  const usable = rows.filter((r) => {
    if (r.warnings.length > 0 && !options.incluirConAdvertencias) {
      summary.omitidos++;
      return false;
    }
    return true;
  });

  const BATCH_SIZE = 25;
  for (let i = 0; i < usable.length; i += BATCH_SIZE) {
    const batch = usable.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((row) => importRow(row, comercioId, options, summary)));
    onProgress?.(Math.min(i + BATCH_SIZE, usable.length), usable.length);
  }

  return summary;
}

async function importRow(
  row: ParsedRow,
  comercioId: string,
  options: ImportOptions,
  summary: ImportSummary,
): Promise<void> {
  const revisar = row.warnings.length > 0;
  if (revisar) summary.conAdvertencias++;

  let existing: Product | null = null;
  if (row.barra) {
    const { data } = await supabase
      .from("productos")
      .select("*")
      .eq("comercio_id", comercioId)
      .eq("codigo_barras", row.barra)
      .limit(1)
      .maybeSingle();
    if (data) existing = mapRow(data);
  }
  if (!existing && row.codigo) {
    const { data } = await supabase
      .from("productos")
      .select("*")
      .eq("comercio_id", comercioId)
      .eq("codigo", row.codigo)
      .limit(1)
      .maybeSingle();
    if (data) existing = mapRow(data);
  }

  const category = toCategory(row.rubro, row.subrubro);

  if (existing) {
    if (options.stockStrategy === "solo_nuevos") return;

    const stock =
      options.stockStrategy === "reemplazar"
        ? row.stock
        : options.stockStrategy === "sumar"
          ? existing.stock + row.stock
          : existing.stock;

    const { error } = await supabase
      .from("productos")
      .update({
        name: row.descripcion || existing.name,
        price: row.precio || existing.price,
        category: category || existing.category,
        codigo: row.codigo || existing.codigo,
        codigo_barras: row.barra || existing.codigoBarras,
        stock,
        lote: row.lote ?? existing.lote ?? null,
        revisar,
      })
      .eq("comercio_id", comercioId)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    summary.actualizados++;
  } else {
    const { error } = await supabase.from("productos").insert({
      comercio_id: comercioId,
      codigo: row.codigo || null,
      codigo_barras: row.barra || null,
      name: row.descripcion,
      description: "",
      price: row.precio,
      category,
      image_url: "",
      stock: row.stock,
      stock_minimo: 0,
      lote: row.lote ?? null,
      revisar,
      disabled: false,
    });
    if (error) throw new Error(error.message);
    summary.creados++;
  }
}
