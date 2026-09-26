"use client";
// components/stock/oferta-dialog.tsx — "estudio de ofertas": promos de un toque,
// simulador de rentabilidad y vista previa del cartel en vivo. Al guardar pasa
// a OfertaPublicada (imprimir cartel / compartir por WhatsApp).
import { useEffect, useMemo, useState } from "react";
import { Clock, Sparkles, Tag, Wand2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { analizarOferta, plantillasOferta, precioRedondo, type PlantillaOferta } from "@/lib/oferta-analisis";
import { sugerirDescuentoVencimiento, diasHastaVencimiento } from "@/lib/oferta-vencimiento";
import { CartelOferta } from "@/components/stock/cartel-oferta";
import { OfertaRentabilidad } from "@/components/stock/oferta-rentabilidad";
import { OfertaPublicada, useNombreComercio } from "@/components/stock/oferta-publicada";
import type { OfertaTipo, Product } from "@/lib/types";
import type { SetOfertaInput } from "@/services/products-service";

interface OfertaDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Debe lanzar si no se pudo guardar, para no mostrar "Oferta publicada". */
  onSubmit: (oferta: SetOfertaInput) => Promise<void>;
  onImprimirCartel?: (producto: Product, comercio: string) => void;
}

/** "final" es un modo de carga: se guarda como descuento en $ (monto = precio - final). */
type Modo = OfertaTipo | "final";

const MODOS: { value: Modo; label: string }[] = [
  { value: "porcentaje", label: "% off" },
  { value: "monto", label: "$ menos" },
  { value: "final", label: "Precio final" },
  { value: "combo", label: "Combo" },
];

export function OfertaDialog({ product, open, onOpenChange, onSubmit, onImprimirCartel }: OfertaDialogProps) {
  const [activa, setActiva] = useState(false);
  const [modo, setModo] = useState<Modo>("porcentaje");
  const [valor, setValor] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const [publicada, setPublicada] = useState<Product | null>(null);
  const [working, setWorking] = useState(false);
  const [comercio] = useNombreComercio();

  useEffect(() => {
    if (open && product) {
      // Si se abre el estudio es para armar (o retocar) una oferta: arranca activa
      setActiva(true);
      setModo(product.ofertaTipo ?? "porcentaje");
      setValor(product.ofertaValor ? String(product.ofertaValor) : "");
      setCantidad(product.ofertaCantidad ? String(product.ofertaCantidad) : "");
      setPlantilla(null);
      setPublicada(null);
    }
  }, [open, product]);

  const borrador = useMemo<Product | null>(() => {
    if (!product) return null;
    const num = Number(valor) || 0;
    const tipo: OfertaTipo = modo === "final" ? "monto" : modo;
    return {
      ...product,
      ofertaActiva: activa,
      ofertaTipo: tipo,
      ofertaValor: modo === "final" ? Math.round((product.price - num) * 100) / 100 : num,
      ofertaCantidad: modo === "combo" ? Number(cantidad) || undefined : undefined,
    };
  }, [product, activa, modo, valor, cantidad]);

  if (!product || !borrador) return null;

  const num = Number(valor) || 0;
  const cant = Number(cantidad) || 0;
  const esKg = product.unidad === "kg";
  const analisis = analizarOferta(borrador);

  const error = !activa ? null
    : modo === "combo"
      ? !Number.isInteger(cant) || cant < 2 ? "El combo necesita 2 o más unidades"
        : num <= 0 ? "Ingresá el precio del combo"
        : num >= product.price * cant ? `Tiene que salir menos que ${cant} sueltos (${formatCurrency(product.price * cant)})`
        : null
      : num <= 0 ? "Ingresá un valor mayor a 0"
      : modo === "porcentaje" && num >= 100 ? "El descuento tiene que ser menor a 100%"
      : modo === "monto" && num >= product.price ? "El descuento no puede superar el precio"
      : modo === "final" && num >= product.price ? `Tiene que ser menor a ${formatCurrency(product.price)}`
      : null;

  const dias = product.fechaVencimiento ? diasHastaVencimiento(product.fechaVencimiento) : null;
  const sugeridoVenc = dias != null ? sugerirDescuentoVencimiento(dias) : null;
  const plantillas = plantillasOferta(product.price).filter((p) => !esKg || p.oferta.tipo !== "combo");
  const redondo = modo !== "combo" && !error ? precioRedondo(analisis.precioUnitario) : null;
  const mostrarRedondo = redondo != null && redondo > 0 && redondo < analisis.precioUnitario;

  const aplicarPlantilla = (p: PlantillaOferta) => {
    setModo(p.oferta.tipo);
    setValor(String(p.oferta.valor));
    setCantidad(p.oferta.cantidad ? String(p.oferta.cantidad) : "");
    setPlantilla(p.id);
  };

  const cambiarModo = (m: Modo) => {
    // Al pasar a "precio final" se arranca desde el precio que ya da la oferta
    if (m === "final" && modo !== "final" && !error && activa) {
      setValor(String(analisis.precioUnitario));
    } else if (m !== modo) {
      setValor("");
    }
    setModo(m);
    setPlantilla(null);
  };

  const guardar = async () => {
    if (error) return;
    setWorking(true);
    try {
      await onSubmit({
        activa,
        tipo: borrador.ofertaTipo,
        valor: borrador.ofertaValor,
        cantidad: modo === "combo" ? cant : undefined,
      });
      if (activa) setPublicada(borrador);
      else onOpenChange(false);
    } catch {
      // el padre ya mostro el error
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Sparkles className="h-4 w-4 shrink-0 text-money" />
            <span className="line-clamp-1">Estudio de oferta · {product.name}</span>
          </DialogTitle>
          <DialogDescription className="cifra">
            Precio {formatCurrency(product.price)}{esKg && "/kg"}
            {product.precioBase ? ` · Costo ${formatCurrency(product.precioBase)}` : ""}
            {product.stockControlado ? ` · Stock ${product.stock}` : ""}
          </DialogDescription>
        </DialogHeader>

        {publicada ? (
          <OfertaPublicada
            producto={publicada}
            onImprimirCartel={onImprimirCartel}
            onListo={() => onOpenChange(false)}
          />
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Tag className="h-4 w-4 text-money" /> Producto en oferta
                  </span>
                  <Switch checked={activa} onCheckedChange={setActiva} />
                </label>

                {activa && (
                  <>
                    {sugeridoVenc != null && dias != null && (
                      <button
                        onClick={() => { setModo("porcentaje"); setValor(String(sugeridoVenc)); setPlantilla(null); }}
                        className="flex w-full items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs transition-colors hover:bg-amber-500/20"
                      >
                        <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                        <span className="flex-1">
                          {dias <= 0 ? "Vence hoy" : `Vence en ${dias} día${dias > 1 ? "s" : ""}`}: te sugerimos
                          <b> -{sugeridoVenc}%</b> para venderlo antes de tirarlo.
                        </span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400">Aplicar</span>
                      </button>
                    )}

                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Promos de un toque</p>
                      <div className="grid grid-cols-4 gap-2">
                        {plantillas.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => aplicarPlantilla(p)}
                            title={p.descripcion}
                            className={cn(
                              "rounded-xl border px-1 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-money/60 hover:shadow-sm active:translate-y-0",
                              plantilla === p.id ? "border-money bg-money/15 text-money" : "bg-card",
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">O armala a medida</p>
                      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                        {MODOS.filter((m) => !esKg || m.value !== "combo").map((m) => (
                          <button
                            key={m.value}
                            onClick={() => cambiarModo(m.value)}
                            className={cn(
                              "rounded-lg py-1.5 text-xs font-medium transition-colors",
                              modo === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {modo === "combo" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Llevando</label>
                          <Input
                            type="number" inputMode="numeric" min={2} step={1}
                            value={cantidad} onChange={(e) => { setCantidad(e.target.value); setPlantilla(null); }}
                            placeholder="Ej: 3" className="rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Paga en total</label>
                          <Input
                            type="number" inputMode="decimal"
                            value={valor} onChange={(e) => { setValor(e.target.value); setPlantilla(null); }}
                            placeholder="Ej: 2000" className="rounded-xl"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          {modo === "porcentaje" ? "Descuento en %" : modo === "monto" ? "Descuento en pesos" : "Precio de oferta"}
                        </label>
                        <Input
                          type="number" inputMode="decimal" autoFocus
                          value={valor} onChange={(e) => { setValor(e.target.value); setPlantilla(null); }}
                          placeholder={modo === "porcentaje" ? "Ej: 15" : modo === "monto" ? "Ej: 200" : `Menos de ${product.price}`}
                          className="rounded-xl"
                        />
                      </div>
                    )}

                    {error && valor !== "" && <p className="text-xs text-destructive">{error}</p>}

                    {mostrarRedondo && (
                      <button
                        onClick={() => { setModo("final"); setValor(String(redondo)); setPlantilla(null); }}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Redondear a {formatCurrency(redondo)} (los precios terminados en 9 venden más)
                      </button>
                    )}

                    {!error && <OfertaRentabilidad
                      analisis={analisis}
                      costo={product.precioBase}
                      stock={product.stock}
                      stockControlado={product.stockControlado}
                    />}
                  </>
                )}

                {!activa && product.ofertaActiva && (
                  <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    Al guardar, el producto vuelve a su precio de lista.
                  </p>
                )}
              </div>

              {activa && (
                <div className="hidden md:block">
                  <p className="mb-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Así queda el cartel</p>
                  <div className={cn("rounded-2xl bg-muted/60 p-3 transition-opacity", error && "opacity-40")}>
                    <CartelOferta producto={borrador} comercio={comercio.trim()} style={{ fontSize: "6.2px" }} />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="rounded-xl" disabled={working || !!error} onClick={guardar}>
                {working ? "Guardando..." : activa ? "Publicar oferta" : "Guardar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
