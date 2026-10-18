"use client";

// components/pos/peso-dialog.tsx — cuanto se lleva de un producto fraccionable
// (kg, m o l: lib/unidades.ts). Se tipea la cantidad ("0,350") o el importe
// ("dame $2.000 de almendras"): con importe se calcula la cantidad al gramo
// (o al milimetro / mililitro) y el servidor cobra precio x esa cantidad.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { precioFinal } from "@/lib/pricing";
import { cantidadTexto, numeroCantidad, parseCantidad } from "@/lib/cantidad";
import { cantidadDesdeImporte } from "@/lib/importe";
import { magnitud, simboloUnidad } from "@/lib/unidades";
import { leerConfigBalanzaSerie } from "@/lib/balanza-config";
import { leerPesoBalanza, soportaBalanzaSerie } from "@/lib/balanza-puerto";
import type { Product } from "@/lib/types";

interface PesoDialogProps {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (cantidad: number) => void;
}

type Modo = "cantidad" | "importe";

/** Reintentos mientras el peso esta inestable o el plato vacio (~5 s). */
const INTENTOS_BALANZA = 10;

export function PesoDialog({ product, onOpenChange, onConfirm }: PesoDialogProps) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<Modo>("cantidad");
  const [balanza, setBalanza] = useState<{ leyendo: boolean; mensaje: string | null }>({ leyendo: false, mensaje: null });
  // Cambia al cerrar o abrir otro producto: una lectura vieja no pisa la nueva.
  const turno = useRef(0);

  const usaBalanza = !!product && product.unidad === "kg" && soportaBalanzaSerie() && leerConfigBalanzaSerie().activa;

  const leerBalanza = useCallback(async () => {
    const mio = ++turno.current;
    setBalanza({ leyendo: true, mensaje: "Leyendo la balanza…" });
    const cfg = leerConfigBalanzaSerie();
    for (let i = 0; i < INTENTOS_BALANZA; i++) {
      try {
        const l = await leerPesoBalanza(cfg);
        if (turno.current !== mio) return;
        if (l.tipo === "peso" && l.kg > 0) {
          setModo("cantidad");
          setTexto(numeroCantidad(l.kg, "kg"));
          setBalanza({ leyendo: false, mensaje: null });
          return;
        }
        setBalanza({
          leyendo: true,
          mensaje: l.tipo === "inestable" ? "Peso inestable, esperá…"
            : l.tipo === "peso" ? "Poné el producto en la balanza…"
            : l.tipo === "error" ? l.motivo : "La balanza no responde…",
        });
      } catch (e) {
        if (turno.current === mio) setBalanza({ leyendo: false, mensaje: e instanceof Error ? e.message : "No se pudo leer la balanza" });
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
      if (turno.current !== mio) return;
    }
    setBalanza({ leyendo: false, mensaje: "No llegó un peso estable. Tipealo o probá de nuevo." });
  }, []);

  useEffect(() => {
    turno.current++;
    if (product) {
      setTexto("");
      setModo("cantidad");
      setBalanza({ leyendo: false, mensaje: null });
      // Balanza conectada: el peso se lee solo al abrir (se puede tipear igual).
      if (product.unidad === "kg" && soportaBalanzaSerie() && leerConfigBalanzaSerie().activa) void leerBalanza();
    }
  }, [product, leerBalanza]);

  if (!product) return null;

  const simbolo = simboloUnidad(product.unidad);
  const precio = precioFinal(product);
  const numero = parseCantidad(texto) ?? 0;
  const cantidad = modo === "cantidad"
    ? Math.round(numero * 1000) / 1000
    : cantidadDesdeImporte(numero, precio) ?? 0;
  const subtotal = Math.round(cantidad * precio * 100) / 100;

  const handle = () => {
    if (cantidad <= 0) return;
    onConfirm(cantidad);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {formatCurrency(precio)} por {simbolo}
          </p>
          <div className="flex rounded-xl border p-0.5" role="tablist">
            {([
              { valor: "cantidad", label: magnitud(product.unidad) === "peso" ? "Por peso" : `Por ${magnitud(product.unidad)}` },
              { valor: "importe", label: "Por importe ($)" },
            ] as const).map((m) => (
              <button
                key={m.valor}
                type="button"
                role="tab"
                aria-selected={modo === m.valor}
                onClick={() => { setModo(m.valor); setTexto(""); }}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  modo === m.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Input
            type="text" inputMode="decimal" autoFocus
            placeholder={modo === "cantidad" ? `Cantidad en ${simbolo} (ej. ${product.unidad === "kg" ? "0,350" : "2,5"})` : "Importe en $ (ej. 2000)"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            className="rounded-xl text-center text-lg"
          />
          {usaBalanza && modo === "cantidad" && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {balanza.leyendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
                {balanza.mensaje ?? (texto ? "Peso leído de la balanza" : "Balanza conectada")}
              </span>
              <button type="button" onClick={() => void leerBalanza()} disabled={balanza.leyendo} className="font-semibold text-primary disabled:opacity-50">
                Leer de nuevo
              </button>
            </div>
          )}
          {cantidad > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {modo === "importe" && <>{cantidadTexto(cantidad, product.unidad)} · </>}
              Subtotal: <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={cantidad <= 0} onClick={handle}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
