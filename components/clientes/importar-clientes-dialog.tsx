"use client";
// components/clientes/importar-clientes-dialog.tsx — importar clientes (y su
// deuda de fiado) desde un Excel o CSV: elegir archivo, asignar columnas,
// revisar y confirmar. Mismo flujo que la importacion de productos.
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Upload, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import {
  adivinarMapeo, CLIENTE_AUTO_MATCH, CLIENTE_CAMPO_LABEL, CLIENTE_CAMPOS, parsearClientes,
  type ClienteFila, type ClienteMapeo,
} from "@/lib/importar-filas";
import { descargarPlantilla, EXTENSIONES_PLANILLA, readRawRows, readSheet } from "@/services/import-service";
import { importarClientes, type EstrategiaClientes, type ResumenClientes } from "@/services/importar-clientes-service";
import { AyudaArchivo } from "@/components/importacion/ayuda-archivo";
import type * as XLSX from "xlsx-js-style";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type Paso = "archivo" | "preview" | "progreso" | "resultado";

const COLUMNAS_AYUDA = [
  { nombre: "Nombre", ejemplo: "Juan Pérez", obligatoria: true },
  { nombre: "Teléfono", ejemplo: "3442 123456" },
  { nombre: "DNI o CUIT", ejemplo: "30123456" },
  { nombre: "Deuda actual", ejemplo: "1.500,50" },
  { nombre: "Límite de fiado", ejemplo: "20000" },
  { nombre: "Notas", ejemplo: "paga los viernes" },
];

const ESTRATEGIAS: { value: EstrategiaClientes; label: string; hint: string }[] = [
  { value: "solo_nuevos", label: "Solo agregar nuevos", hint: "Si ya existe (mismo DNI, teléfono o nombre) se saltea" },
  { value: "actualizar", label: "Completar los existentes", hint: "Les carga teléfono, DNI, límite y notas. La deuda no se toca" },
];

const selectClase = "border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export function ImportarClientesDialog({ open, onOpenChange, onImported }: Props) {
  const [paso, setPaso] = useState<Paso>("archivo");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [letras, setLetras] = useState<string[]>([]);
  const [muestra, setMuestra] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<ClienteMapeo>({});
  const [startRow, setStartRow] = useState(2);
  const [filas, setFilas] = useState<ClienteFila[]>([]);
  const [sinNombre, setSinNombre] = useState(0);
  const [estrategia, setEstrategia] = useState<EstrategiaClientes>("solo_nuevos");
  const [incluirConAdvertencias, setIncluirConAdvertencias] = useState(true);
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [resumen, setResumen] = useState<ResumenClientes | null>(null);
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);

  const reset = () => {
    setPaso("archivo"); setWorkbook(null); setLetras([]); setMuestra([]); setMapeo({}); setStartRow(2);
    setFilas([]); setSinNombre(0); setEstrategia("solo_nuevos"); setIncluirConAdvertencias(true);
    setProgreso({ hecho: 0, total: 0 }); setResumen(null); setError("");
  };
  const cerrar = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const muestraDe = (letra: string): string => {
    const idx = letras.indexOf(letra);
    if (idx < 0) return "";
    const fila = muestra[startRow - 1] ?? muestra.find((r) => r[idx]);
    return fila?.[idx]?.trim() ?? "";
  };

  const elegirArchivo = async (file: File) => {
    setError("");
    setLeyendo(true);
    try {
      const { workbook: wb, preview } = await readSheet(file);
      setWorkbook(wb);
      setLetras(preview.columnLetters);
      setMuestra(preview.sampleRows);
      const adivinado = adivinarMapeo(preview.sampleRows[0] ?? [], CLIENTE_AUTO_MATCH);
      setMapeo(adivinado);
      // Sin encabezados reconocibles, los datos empiezan en la fila 1.
      setStartRow(adivinado.nombre ? 2 : 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
    }
  };

  const irAPreview = () => {
    if (!workbook) return;
    const r = parsearClientes(readRawRows(workbook), mapeo, startRow);
    setFilas(r.filas);
    setSinNombre(r.sinNombre);
    setPaso("preview");
  };

  const stats = useMemo(() => {
    const conAdvertencias = filas.filter((f) => f.warnings.length > 0).length;
    const deuda = filas.reduce((s, f) => s + f.saldo, 0);
    return { total: filas.length, conAdvertencias, ok: filas.length - conAdvertencias, deuda, conDeuda: filas.filter((f) => f.saldo > 0).length };
  }, [filas]);

  const importar = async () => {
    const usables = filas.filter((f) => incluirConAdvertencias || f.warnings.length === 0);
    setPaso("progreso");
    setProgreso({ hecho: 0, total: usables.length });
    try {
      const r = await importarClientes(usables, estrategia, (hecho, total) => setProgreso({ hecho, total }));
      r.omitidos += filas.length - usables.length;
      setResumen(r);
      setPaso("resultado");
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error durante la importación");
      setPaso("resultado");
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Importar clientes</DialogTitle>
        </DialogHeader>

        {paso === "archivo" && (
          <div className="space-y-4">
            <AyudaArchivo
              que="clientes"
              columnas={COLUMNAS_AYUDA}
              ubicacion="importar-clientes"
              abiertoAlInicio={!workbook}
              onPlantilla={(f) => descargarPlantilla("clientes", ["Nombre", "Teléfono", "DNI", "Deuda", "Límite de fiado", "Notas"], ["Juan Pérez", "3442123456", "30123456", 1500.5, 20000, "paga los viernes"], f)}
            />
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center hover:bg-muted/50">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {workbook ? "Archivo cargado — elegí otro si querés cambiarlo" : "Elegí tu lista de clientes (Excel o CSV)"}
              </span>
              <span className="text-xs text-muted-foreground">Vale la libreta de fiados pasada a planilla: nombre, teléfono y lo que debe cada uno.</span>
              <input type="file" accept={EXTENSIONES_PLANILLA} className="hidden" onChange={(e) => e.target.files?.[0] && elegirArchivo(e.target.files[0])} />
            </label>
            {leyendo && <p className="text-center text-sm text-muted-foreground">Leyendo archivo...</p>}
            {error && <p className="text-center text-sm text-destructive">{error}</p>}

            {letras.length > 0 && (
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block">Fila donde empiezan los datos</Label>
                  <Input type="number" min={1} value={startRow} onChange={(e) => setStartRow(Math.max(1, Number(e.target.value) || 1))} className="rounded-xl" />
                </div>
                <p className="text-xs text-muted-foreground">Elegí la columna (A, B, C...) para cada dato. Al lado se ve lo que trae la primera fila.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CLIENTE_CAMPOS.map((campo) => (
                    <div key={campo}>
                      <Label className="mb-1 block text-xs">{CLIENTE_CAMPO_LABEL[campo]}</Label>
                      <select value={mapeo[campo] ?? ""} onChange={(e) => setMapeo((m) => ({ ...m, [campo]: e.target.value || undefined }))} className={selectClase}>
                        <option value="">— sin usar —</option>
                        {letras.map((l) => {
                          const s = muestraDe(l);
                          return <option key={l} value={l}>{l}{s ? ` — ${s.slice(0, 24)}` : ""}</option>;
                        })}
                      </select>
                    </div>
                  ))}
                </div>
                {!mapeo.nombre && <p className="text-xs text-warning">Falta elegir la columna del nombre.</p>}
              </div>
            )}
          </div>
        )}

        {paso === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/50 p-3"><p className="text-lg font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Clientes leídos</p></div>
              <div className="rounded-xl bg-muted/50 p-3"><p className="text-lg font-bold text-money">{stats.ok}</p><p className="text-xs text-muted-foreground">Sin problemas</p></div>
              <div className="rounded-xl bg-muted/50 p-3"><p className="text-lg font-bold text-warning">{stats.conAdvertencias}</p><p className="text-xs text-muted-foreground">Con advertencias</p></div>
            </div>
            {stats.conDeuda > 0 && (
              <p className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
                <b>{stats.conDeuda}</b> cliente{stats.conDeuda === 1 ? "" : "s"} entra{stats.conDeuda === 1 ? "" : "n"} con deuda: <b className="cifra">{formatCurrency(stats.deuda)}</b> en total.
                Queda registrada en su cuenta corriente como "Deuda inicial (importación)".
              </p>
            )}
            {sinNombre > 0 && <p className="text-xs text-muted-foreground">{sinNombre} fila{sinNombre === 1 ? "" : "s"} sin nombre no se importa{sinNombre === 1 ? "" : "n"}.</p>}

            {stats.conAdvertencias > 0 && (
              <>
                <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-warning" /> Incluir los que tienen advertencias</span>
                  <Switch checked={incluirConAdvertencias} onCheckedChange={setIncluirConAdvertencias} />
                </label>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {filas.filter((f) => f.warnings.length > 0).slice(0, 30).map((f) => (
                    <li key={f.rowNumber}>Fila {f.rowNumber} · <b className="text-foreground">{f.nombre}</b>: {f.warnings.join(", ")}</li>
                  ))}
                </ul>
              </>
            )}

            <div>
              <Label className="mb-2 block">Si el cliente ya está cargado</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ESTRATEGIAS.map((s) => (
                  <button key={s.value} type="button" onClick={() => setEstrategia(s.value)} className={cn("rounded-xl border p-3 text-left transition-colors", estrategia === s.value ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {paso === "progreso" && (
          <div className="space-y-3 py-6">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${progreso.total ? (progreso.hecho / progreso.total) * 100 : 0}%` }} />
            </div>
            <p className="text-center text-sm text-muted-foreground">Cargando {progreso.hecho} de {progreso.total}...</p>
          </div>
        )}

        {paso === "resultado" && (
          <div className="space-y-4">
            {error ? (
              <p className="text-center text-sm text-destructive">{error}</p>
            ) : resumen ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-money"><CheckCircle2 className="h-5 w-5" /><span className="font-medium">Clientes importados</span></div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Nuevos: <strong className="text-foreground">{resumen.creados}</strong>{resumen.conDeuda > 0 && <> ({resumen.conDeuda} con deuda inicial)</>}</li>
                  <li>Completados: <strong className="text-foreground">{resumen.actualizados}</strong></li>
                  <li>Salteados: <strong className="text-foreground">{resumen.omitidos}</strong></li>
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {paso === "archivo" && (
            <Button className="rounded-xl" disabled={!workbook || !mapeo.nombre} onClick={irAPreview}>Continuar <ArrowRight className="ml-1 h-4 w-4" /></Button>
          )}
          {paso === "preview" && (
            <>
              <Button variant="outline" className="rounded-xl" onClick={() => setPaso("archivo")}><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
              <Button className="rounded-xl" disabled={filas.length === 0} onClick={importar}>Confirmar importación</Button>
            </>
          )}
          {paso === "resultado" && <Button className="rounded-xl" onClick={() => cerrar(false)}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
