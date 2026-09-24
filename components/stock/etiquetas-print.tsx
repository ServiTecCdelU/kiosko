// components/stock/etiquetas-print.tsx — etiquetas de gondola (nombre +
// precio grande + codigo de barras) para hoja A4, impresas desde el navegador.
// Mismo criterio que components/pos/ticket-print.tsx: se renderiza siempre
// fuera de pantalla y solo se muestra al imprimir (ver #etiquetas-print en
// app/globals.css).
import { formatCurrency } from "@/lib/utils/format";
import { BarcodeEAN13 } from "@/components/stock/barcode-svg";
import type { Product } from "@/lib/types";

export function EtiquetasPrint({ productos }: { productos: Product[] }) {
  if (productos.length === 0) return null;

  return (
    <div id="etiquetas-print">
      <div className="etiquetas-grid">
        {productos.map((p) => (
          <div key={p.id} className="etiqueta">
            <p className="etiqueta-nombre">{p.name}</p>
            <p className="etiqueta-precio">
              {formatCurrency(p.price)}
              {p.unidad === "kg" && <span className="etiqueta-unidad"> /kg</span>}
            </p>
            {p.codigoBarras ? (
              <>
                <BarcodeEAN13 codigo={p.codigoBarras} height={30} />
                <p className="etiqueta-codigo">{p.codigoBarras}</p>
              </>
            ) : p.codigo ? (
              <p className="etiqueta-codigo">Cod. {p.codigo}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
