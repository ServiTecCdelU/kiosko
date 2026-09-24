// components/stock/barcode-svg.tsx — dibuja un EAN-13 como SVG de barras,
// sin canvas ni librerias nuevas (ver lib/ean13-barcode.ts).
import { generarBarrasEAN13 } from "@/lib/ean13-barcode";

export function BarcodeEAN13({ codigo, height = 32 }: { codigo: string; height?: number }) {
  const barras = generarBarrasEAN13(codigo);
  if (!barras) return null;

  const anchoTotal = barras.reduce((s, b) => s + b.ancho, 0); // siempre 95
  let x = 0;

  return (
    <svg
      viewBox={`0 0 ${anchoTotal} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Codigo de barras ${codigo}`}
    >
      <rect x={0} y={0} width={anchoTotal} height={height} fill="white" />
      {barras.map((b, i) => {
        const rectX = x;
        x += b.ancho;
        if (!b.negra) return null;
        return <rect key={i} x={rectX} y={0} width={b.ancho} height={height} fill="black" />;
      })}
    </svg>
  );
}
