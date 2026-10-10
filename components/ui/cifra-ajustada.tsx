// components/ui/cifra-ajustada.tsx — una cifra de plata que se achica sola
// hasta entrar en el ancho de su tarjeta, en vez de cortarse con "…" o
// desbordar. Usa unidades de container query (cqw): el tamaño sale del ancho
// real del contenedor y del largo del texto, sin medir con JS.
// Se usa en las tarjetas del inicio y en el arqueo de Caja.
import { cn } from "@/lib/utils";

/** Ancho aproximado de un caracter de la fuente display, en em. */
const ANCHO_CARACTER = 0.6;

export function CifraAjustada({
  texto, maxRem, minRem = 0.875, hero = false, className,
}: {
  texto: string;
  /** Tamaño maximo (rem): el que tiene cuando sobra lugar. */
  maxRem: number;
  /** Tamaño minimo (rem): por debajo de esto se prefiere desbordar a volverse ilegible. */
  minRem?: number;
  /** Tipografia protagonista (.cifra-hero) en vez de la comun (.cifra). */
  hero?: boolean;
  className?: string;
}) {
  const factor = Math.max(1, texto.length) * ANCHO_CARACTER;
  return (
    <div className="w-full min-w-0" style={{ containerType: "inline-size" }}>
      <p
        className={cn(hero ? "cifra-hero" : "cifra", "whitespace-nowrap", className)}
        style={{ fontSize: `clamp(${minRem}rem, calc(100cqw / ${factor}), ${maxRem}rem)` }}
      >
        {texto}
      </p>
    </div>
  );
}
