"use client";
// components/compras/factura-afip-dialog.tsx — cargar una compra desde la
// factura electronica del proveedor. Del QR de AFIP (PDF, foto o camara) sale
// la cabecera sin falla: proveedor por CUIT (se crea si no esta), numero,
// fecha y total a cuenta corriente. Del texto del PDF salen los renglones
// cuando el formato lo permite; se asocian a productos y se confirman a mano.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, ClipboardPaste, FileText, Loader2, Plus, ScanLine, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { formatearCuit, type ComprobanteAfip } from "@/lib/afip/qr-comprobante";
import type { Renglon } from "@/lib/afip/renglones-pdf";
import { leerFacturaPdf, leerQrDeImagen } from "@/services/leer-factura-pdf";
import { crearProveedor, leerFacturaAfip, type LecturaFacturaAfip, type Proveedor } from "@/services/compras-service";
import { createProduct, searchProducts } from "@/services/products-service";
import type { Product } from "@/lib/types";

export interface ItemDeFactura {
  productoId: string;
  nombre: string;
  precioVenta: number;
  lote?: number;
  cantidad: number;
  costoUnitario: number;
}

export interface ResultadoFactura {
  qr: string;
  comprobante: ComprobanteAfip;
  proveedorId: string;
  items: ItemDeFactura[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedores: Proveedor[];
  onProveedorCreado: () => Promise<void>;
  onCargar: (r: ResultadoFactura) => void;
}

type Fuente = "archivo" | "camara" | "texto";

interface FilaRenglon {
  renglon: Renglon;
  incluir: boolean;
  producto: Product | null;
  /** Candidatos de la busqueda automatica. */
  candidatos: Product[];
  busqueda: string;
  buscando: boolean;
  crear: boolean;
  precioVenta: string;
  /** Como se encontro: por codigo (seguro), por nombre (revisar) o nada. */
  origen: "codigo" | "nombre" | null;
}

const MARGEN_SUGERIDO = 1.35;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function FacturaAfipDialog({ open, onOpenChange, proveedores, onProveedorCreado, onCargar }: Props) {
  const [fuente, setFuente] = useState<Fuente>("archivo");
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [texto, setTexto] = useState("");
  const [lectura, setLectura] = useState<LecturaFacturaAfip | null>(null);
  const [proveedorId, setProveedorId] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  const [filas, setFilas] = useState<FilaRenglon[]>([]);
  const [motivoRenglones, setMotivoRenglones] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const reset = () => {
    setFuente("archivo"); setEstado(null); setError(""); setQr(""); setTexto(""); setLectura(null);
    setProveedorId(""); setNuevoNombre(""); setFilas([]); setMotivoRenglones(null); setCargando(false);
  };
  const cerrar = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  // Camara: lee el primer QR que aparezca.
  useEffect(() => {
    if (!open || fuente !== "camara" || lectura) return;
    let controles: { stop: () => void } | null = null;
    let cancelado = false;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        controles = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (result && !cancelado) {
            cancelado = true;
            controles?.stop();
            procesarQr(result.getText());
          }
        });
      } catch {
        setError("No se pudo abrir la cámara. Probá subiendo una foto o el PDF.");
      }
    })();
    return () => {
      cancelado = true;
      controles?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fuente, lectura]);

  const procesarQr = async (codigo: string, renglones: Renglon[] = [], razonSocial: string | null = null, motivo: string | null = null) => {
    setError("");
    setEstado("Verificando la factura…");
    try {
      const l = await leerFacturaAfip(codigo);
      setQr(codigo);
      setLectura(l);
      setProveedorId(l.proveedor?.id ?? "");
      setNuevoNombre(razonSocial ?? "");
      setMotivoRenglones(motivo);
      setFilas(renglones.map((r) => ({
        renglon: r, incluir: true, producto: null, candidatos: [], busqueda: "", buscando: true, crear: false,
        precioVenta: String(r2(r.precioUnitario * MARGEN_SUGERIDO)), origen: null,
      })));
      asociarRenglones(renglones);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la factura");
    } finally {
      setEstado(null);
    }
  };

  /** Busca cada renglon en el catalogo: por codigo exacto y, si no, por nombre. */
  const asociarRenglones = async (renglones: Renglon[]) => {
    for (let i = 0; i < renglones.length; i++) {
      const r = renglones[i];
      let producto: Product | null = null;
      let candidatos: Product[] = [];
      let origen: FilaRenglon["origen"] = null;
      try {
        if (r.codigo) {
          const porCodigo = await searchProducts(r.codigo, 5);
          producto = porCodigo.find((p) => p.codigoBarras === r.codigo || p.codigo === r.codigo) ?? null;
          if (producto) origen = "codigo";
        }
        if (!producto && r.descripcion) {
          const palabras = r.descripcion.split(/\s+/).filter((w) => w.length > 2).slice(0, 3).join(" ");
          candidatos = palabras ? await searchProducts(palabras, 5) : [];
          if (candidatos.length > 0) {
            producto = candidatos[0];
            origen = "nombre";
          }
        }
      } catch {
        // sin red o sin resultados: queda sin asociar
      }
      setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, producto, candidatos, origen, buscando: false, crear: !producto && !!r.descripcion } : f)));
    }
  };

  const elegirArchivo = async (file: File) => {
    setError("");
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const l = await leerFacturaPdf(file, setEstado);
        if (!l.qr) {
          setEstado(null);
          setError(
            l.renglones.length > 0
              ? "El PDF tiene productos pero no encontré el QR de AFIP: no es una factura electrónica válida (¿remito o presupuesto?)."
              : "No encontré el QR de AFIP en el PDF. Si es una factura electrónica, probá con una captura de pantalla del QR.",
          );
          return;
        }
        await procesarQr(l.qr, l.renglones, l.razonSocial, l.motivo ?? null);
      } else {
        setEstado("Buscando el QR en la imagen…");
        const codigo = await leerQrDeImagen(file);
        if (!codigo) {
          setEstado(null);
          setError("No se ve ningún QR en la imagen. Sacá la foto más cerca y con buena luz.");
          return;
        }
        await procesarQr(codigo);
      }
    } catch (e) {
      setEstado(null);
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  };

  const crearNuevoProveedor = async () => {
    if (!lectura || !nuevoNombre.trim()) return;
    setCreandoProveedor(true);
    try {
      const p = await crearProveedor({ nombre: nuevoNombre.trim(), cuit: lectura.comprobante.cuit });
      await onProveedorCreado();
      setProveedorId(p.id);
      setLectura({ ...lectura, proveedor: { id: p.id, nombre: p.nombre, activo: true } });
      toast.success(`Proveedor "${p.nombre}" creado con CUIT ${formatearCuit(lectura.comprobante.cuit)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el proveedor");
    } finally {
      setCreandoProveedor(false);
    }
  };

  const buscarEnFila = (i: number, q: string) => {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, busqueda: q, buscando: !!q.trim() } : f)));
    if (!q.trim()) return;
    searchProducts(q, 6).then((res) => {
      setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, candidatos: res, buscando: false } : f)));
    }).catch(() => setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, buscando: false } : f))));
  };

  const setFila = (i: number, cambios: Partial<FilaRenglon>) =>
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambios } : f)));

  const incluidas = filas.filter((f) => f.incluir && (f.producto || f.crear));
  const listas = incluidas.every((f) => f.producto || (f.crear && Number(f.precioVenta) > 0));
  const puedeCargar = !!lectura && !!proveedorId && !lectura.duplicada && !lectura.comprobante.esNotaCredito && listas && !cargando;

  const cargar = async () => {
    if (!lectura || !puedeCargar) return;
    setCargando(true);
    try {
      const items: ItemDeFactura[] = [];
      for (const f of incluidas) {
        const r = f.renglon;
        if (f.producto) {
          items.push({ productoId: f.producto.id, nombre: f.producto.name, precioVenta: f.producto.price, lote: f.producto.lote && f.producto.lote > 1 ? f.producto.lote : undefined, cantidad: r.cantidad, costoUnitario: r.precioUnitario });
        } else {
          const esBarra = /^\d{8,14}$/.test(r.codigo);
          const id = await createProduct({
            name: r.descripcion.slice(0, 120), price: Number(f.precioVenta), stock: 0,
            codigoBarras: esBarra ? r.codigo : undefined, codigo: !esBarra && r.codigo ? r.codigo : undefined,
            costo: r.precioUnitario, revisar: true,
          });
          items.push({ productoId: id, nombre: r.descripcion.slice(0, 120), precioVenta: Number(f.precioVenta), cantidad: r.cantidad, costoUnitario: r.precioUnitario });
        }
      }
      onCargar({ qr, comprobante: lectura.comprobante, proveedorId, items });
      cerrar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron crear los productos");
    } finally {
      setCargando(false);
    }
  };

  const c = lectura?.comprobante ?? null;
  const sumaRenglones = incluidas.reduce((s, f) => s + f.renglon.subtotal, 0);

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-primary" /> Leer factura de AFIP</DialogTitle>
        </DialogHeader>

        {!lectura ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Toda factura electrónica trae un QR de AFIP. Con eso reconocemos al proveedor, el número, la fecha y el total.
              Si subís el PDF, además intentamos leer los productos. Remitos, presupuestos y tickets sin QR no sirven.
            </p>
            <div className="inline-flex rounded-xl border bg-card p-1">
              {([["archivo", "PDF o foto", FileText], ["camara", "Cámara", Camera], ["texto", "Pegar", ClipboardPaste]] as const).map(([k, label, Icono]) => (
                <button key={k} type="button" onClick={() => { setFuente(k); setError(""); }} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", fuente === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icono className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {fuente === "archivo" && (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:bg-muted/50">
                <FileText className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Elegí el PDF de la factura o una foto del QR</span>
                <span className="text-xs text-muted-foreground">El PDF que te mandó el proveedor por WhatsApp o mail. También sirve una captura de pantalla del QR.</span>
                <input type="file" accept=".pdf,application/pdf,image/*" className="hidden" disabled={!!estado} onChange={(e) => e.target.files?.[0] && elegirArchivo(e.target.files[0])} />
              </label>
            )}
            {fuente === "camara" && (
              <div className="overflow-hidden rounded-2xl bg-black">
                <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
                <p className="bg-black/70 px-3 py-1.5 text-center text-xs text-white">Enfocá el QR de la factura impresa</p>
              </div>
            )}
            {fuente === "texto" && (
              <div className="space-y-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Pegá el link del QR (https://www.afip.gob.ar/fe/qr/?p=...)" className="border-input w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" />
                <Button size="sm" className="rounded-xl" disabled={!texto.trim() || !!estado} onClick={() => procesarQr(texto)}>Leer</Button>
              </div>
            )}
            {estado && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {estado}</p>}
            {error && <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
          </div>
        ) : c && (
          <div className="space-y-4">
            {/* Cabecera leida del QR */}
            <div className="rounded-xl border border-success/40 bg-success/5 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-success" /> {c.nombre}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span>Fecha <b className="text-foreground">{formatDate(c.fecha)}</b></span>
                <span>Total <b className="cifra text-foreground">{formatCurrency(c.importe)}</b></span>
                <span>CUIT emisor <b className="text-foreground">{formatearCuit(c.cuit)}</b></span>
                <span>CAE {c.cae}</span>
              </p>
              {lectura.avisos.map((a) => (
                <p key={a} className="mt-1.5 flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a}</p>
              ))}
              {lectura.duplicada && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Esta factura ya está cargada (compra del {formatDate(lectura.duplicada.fecha)} por {formatCurrency(lectura.duplicada.total)}). No se carga dos veces.</p>
              )}
            </div>

            {/* Proveedor */}
            <div className="rounded-xl border p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proveedor</p>
              {lectura.proveedor ? (
                <p className="text-sm">
                  <b>{lectura.proveedor.nombre}</b> <span className="text-muted-foreground">· reconocido por CUIT</span>
                  {!lectura.proveedor.activo && <span className="ml-2 text-destructive">Está inactivo: activalo en Proveedores.</span>}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Ningún proveedor tiene el CUIT {formatearCuit(c.cuit)}. Creamos uno con ese CUIT, o elegí uno existente y le guardamos el CUIT la próxima.</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre del proveedor" className="h-9 rounded-xl" />
                    <Button size="sm" className="h-9 shrink-0 rounded-xl" disabled={!nuevoNombre.trim() || creandoProveedor} onClick={crearNuevoProveedor}>
                      {creandoProveedor ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Crear proveedor
                    </Button>
                  </div>
                  <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none">
                    <option value="">… o elegir uno existente</option>
                    {proveedores.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Renglones */}
            <div className="rounded-xl border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos de la factura</p>
                {filas.length > 0 && <span className="text-xs text-muted-foreground">{incluidas.length} de {filas.length} se cargan · {formatCurrency(sumaRenglones)}</span>}
              </div>
              {filas.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {motivoRenglones ?? "No se leyeron productos (del QR solo sale la cabecera)."} La factura igual se carga a cuenta corriente por su total, y los productos los agregás a mano en la recepción.
                </p>
              ) : (
                <div className="space-y-2">
                  {filas.map((f, i) => (
                    <div key={i} className={cn("rounded-lg border p-2", !f.incluir && "opacity-50")}>
                      <div className="flex flex-wrap items-start gap-2">
                        <input type="checkbox" checked={f.incluir} onChange={(e) => setFila(i, { incluir: e.target.checked })} className="mt-1 h-4 w-4 accent-primary" aria-label="Incluir" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{f.renglon.descripcion || "(sin descripción)"}{f.renglon.codigo && <span className="ml-1.5 text-xs text-muted-foreground">cód. {f.renglon.codigo}</span>}</p>
                          <p className="cifra text-xs text-muted-foreground">{f.renglon.cantidad} × {formatCurrency(f.renglon.precioUnitario)} = {formatCurrency(f.renglon.subtotal)}{f.renglon.metodo === "numeros" && " · leído sin títulos, revisá"}</p>
                        </div>
                      </div>
                      {f.incluir && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                          {f.buscando ? (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando en tu stock…</span>
                          ) : f.producto && !f.crear ? (
                            <>
                              <Badge variant="outline" className={cn("gap-1", f.origen === "codigo" ? "border-success/50 text-success" : "border-warning text-warning")}>
                                {f.origen === "codigo" ? <CheckCircle2 className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                                {f.producto.name}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">{f.origen === "codigo" ? "mismo código" : "parecido por nombre, verificá"}</span>
                              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setFila(i, { producto: null, crear: false })}>Cambiar</button>
                            </>
                          ) : f.crear ? (
                            <>
                              <Badge variant="outline" className="gap-1 border-primary/50 text-primary"><Plus className="h-3 w-3" /> Producto nuevo</Badge>
                              <Label className="text-xs">Precio de venta</Label>
                              <Input type="number" inputMode="decimal" value={f.precioVenta} onChange={(e) => setFila(i, { precioVenta: e.target.value })} className="h-8 w-28 rounded-lg text-right" />
                              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setFila(i, { crear: false })}>Buscar en stock</button>
                            </>
                          ) : (
                            <div className="relative w-full sm:w-80">
                              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input value={f.busqueda} onChange={(e) => buscarEnFila(i, e.target.value)} placeholder="Buscar producto en tu stock…" className="h-8 rounded-lg pl-8 text-sm" />
                              {(f.candidatos.length > 0 || f.busqueda) && (
                                <div className="absolute z-10 mt-1 w-full rounded-xl border bg-card shadow-lg">
                                  {f.candidatos.map((p) => (
                                    <button key={p.id} type="button" onClick={() => setFila(i, { producto: p, origen: "nombre", crear: false, candidatos: [] })} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted/50">
                                      <span className="truncate">{p.name}</span><span className="ml-2 shrink-0 text-xs text-muted-foreground">stock {p.stock}</span>
                                    </button>
                                  ))}
                                  <button type="button" onClick={() => setFila(i, { crear: true, candidatos: [] })} className="flex w-full items-center gap-1.5 border-t px-3 py-1.5 text-left text-sm text-primary hover:bg-muted/50">
                                    <Plus className="h-3.5 w-3.5" /> Crear "{f.renglon.descripcion.slice(0, 40)}" como producto nuevo
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {lectura && (
            <>
              <Button variant="outline" className="rounded-xl" onClick={reset}>Leer otra</Button>
              <Button className="rounded-xl" disabled={!puedeCargar} onClick={cargar}>
                {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {incluidas.length > 0 ? `Cargar ${incluidas.length} producto${incluidas.length === 1 ? "" : "s"} y la factura` : "Cargar la factura sin productos"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
