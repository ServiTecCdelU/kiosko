"use client";
// components/pos/ofertas-rapidas.tsx — "Hoy en oferta" arriba de los productos
// rapidos del POS: el cajero ve que hay en promo y lo suma de un toque (sirve
// tambien para ofrecerlo: "¿no quiere llevar la yerba, que esta 3x2?").
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import type { Product } from "@/lib/types";

interface OfertasRapidasProps {
  ofertas: Product[];
  onAgregar: (p: Product) => void;
}

export function OfertasRapidas({ ofertas, onAgregar }: OfertasRapidasProps) {
  if (ofertas.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-money">
        <Tag className="h-3.5 w-3.5" /> Hoy en oferta
      </p>
      <ul className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
        {ofertas.map((p) => {
          const sinStock = p.stockControlado && p.stock <= 0;
          const a = analizarOferta(p);
          return (
            <li key={p.id}>
              <button
                onClick={() => onAgregar(p)}
                disabled={sinStock}
                className={cn(
                  "flex h-full w-full flex-col gap-1 rounded-xl border border-money/30 bg-money/5 px-2.5 py-2 text-left transition-colors",
                  sinStock ? "opacity-50" : "hover:border-money hover:bg-money/10",
                )}
              >
                <span className="flex items-center justify-between gap-1.5">
                  <span className="rounded-md bg-[#ffd400] px-1.5 py-0.5 text-[10px] font-black text-[#d7141a]">{etiquetaOferta(p)}</span>
                  <span className="cifra text-sm font-bold text-money">
                    {formatCurrency(a.totalPromo)}
                    {a.unidades > 1 && <span className="text-[10px] font-medium"> x{a.unidades}</span>}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs font-medium">{p.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
