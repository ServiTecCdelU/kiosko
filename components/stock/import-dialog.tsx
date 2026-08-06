"use client";

import { useMemo, useState } from "react";
import { Upload, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  readSheet, guessMapping, parseRows, importProducts,
  IMPORT_FIELD_LABELS,
  type ColumnMapping, type ImportField, type ParsedRow, type StockStrategy, type ImportSummary,
} from "@/services/import-service";
import type * as XLSX from "xlsx-js-style";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type Step = "archivo" | "preview" | "progreso" | "resultado";

const FIELDS: ImportField[] = ["barra", "codigo", "descripcion", "precio", "rubro", "subrubro", "stock", "lote"];

const STRATEGIES: { value: StockStrategy; label: string; hint: string }[] = [
  { value: "no_tocar", label: "No tocar stock", hint: "Solo actualiza precio, nombre y rubro" },
  { value: "reemplazar", label: "Reemplazar stock", hint: "El stock pasa a ser el del Excel" },
  { value: "sumar", label: "Sumar al stock", hint: "El valor del Excel se suma al actual" },
  { value: "solo_nuevos", label: "Solo agregar nuevos", hint: "No modifica productos existentes" },
];

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<Step>("archivo");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [startRow, setStartRow] = useState(2);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [stockStrategy, setStockStrategy] = useState<StockStrategy>("no_tocar");
  const [incluirConAdvertencias, setIncluirConAdvertencias] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("archivo");
    setWorkbook(null);
    setHeaders([]);
    setMapping({});
    setStartRow(2);
    setRows([]);
    setStockStrategy("no_tocar");
    setIncluirConAdvertencias(true);
    setProgress({ done: 0, total: 0 });
    setSummary(null);
    setError("");
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFile = async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const { workbook: wb, preview } = await readSheet(file);
      setWorkbook(wb);
      setHeaders(preview.headers);
      setMapping(guessMapping(preview.headers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setLoading(false);
    }
  };

  const canContinueMapping = mapping.descripcion && mapping.precio && (mapping.barra || mapping.codigo);

  const goToPreview = () => {
    if (!workbook) return;
    const parsed = parseRows(workbook, mapping, startRow);
    setRows(parsed);
    setStep("preview");
  };

  const stats = useMemo(() => {
    const conAdvertencias = rows.filter((r) => r.warnings.length > 0).length;
    return { total: rows.length, conAdvertencias, ok: rows.length - conAdvertencias };
  }, [rows]);

  const handleImport = async () => {
    setStep("progreso");
    setProgress({ done: 0, total: rows.length });
    try {
      const res = await importProducts(
        rows,
        { stockStrategy, incluirConAdvertencias },
        (done, total) => setProgress({ done, total }),
      );
      setSummary(res);
      setStep("resultado");
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error durante la importación");
      setStep("resultado");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Importar productos
          </DialogTitle>
        </DialogHeader>

        {step === "archivo" && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:bg-muted/50">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {workbook ? "Archivo cargado — elegí otro si querés cambiarlo" : "Elegí tu lista de precios (.xlsx)"}
              </span>
              <input
                type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
            {loading && <p className="text-center text-sm text-muted-foreground">Leyendo archivo...</p>}
            {error && <p className="text-center text-sm text-destructive">{error}</p>}

            {headers.length > 0 && (
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block">Fila donde empiezan los datos</Label>
                  <Input
                    type="number" min={2} value={startRow}
                    onChange={(e) => setStartRow(Math.max(2, Number(e.target.value) || 2))}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FIELDS.map((field) => (
                    <div key={field}>
                      <Label className="mb-1 block text-xs">{IMPORT_FIELD_LABELS[field]}</Label>
                      <select
                        value={mapping[field] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
                        className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">— sin usar —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {!canContinueMapping && (
                  <p className="text-xs text-warning">
                    Necesitás al menos: Descripción, Precio y Código o Código de barra.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-lg font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Filas leídas</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-lg font-bold text-money">{stats.ok}</p>
                <p className="text-xs text-muted-foreground">Sin problemas</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-lg font-bold text-warning">{stats.conAdvertencias}</p>
                <p className="text-xs text-muted-foreground">Con advertencias</p>
              </div>
            </div>

            {stats.conAdvertencias > 0 && (
              <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Incluir los productos con advertencias (quedan marcados para revisar)
                </span>
                <Switch checked={incluirConAdvertencias} onCheckedChange={setIncluirConAdvertencias} />
              </label>
            )}

            <div>
              <Label className="mb-2 block">Si el producto ya existe en tu stock</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STRATEGIES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStockStrategy(s.value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      stockStrategy === s.value ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "progreso" && (
          <div className="space-y-3 py-6">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Procesando {progress.done} de {progress.total}...
            </p>
          </div>
        )}

        {step === "resultado" && (
          <div className="space-y-4">
            {error ? (
              <p className="text-center text-sm text-destructive">{error}</p>
            ) : summary ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-money">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Importación completada</span>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Creados: <strong className="text-foreground">{summary.creados}</strong></li>
                  <li>Actualizados: <strong className="text-foreground">{summary.actualizados}</strong></li>
                  <li>Omitidos: <strong className="text-foreground">{summary.omitidos}</strong></li>
                  <li>Con advertencias (marcados a revisar): <strong className="text-foreground">{summary.conAdvertencias}</strong></li>
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {step === "archivo" && (
            <Button className="rounded-xl" disabled={!canContinueMapping} onClick={goToPreview}>
              Continuar <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" className="rounded-xl" onClick={() => setStep("archivo")}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Volver
              </Button>
              <Button className="rounded-xl" onClick={handleImport}>
                Confirmar importación
              </Button>
            </>
          )}
          {step === "resultado" && (
            <Button className="rounded-xl" onClick={() => handleClose(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
