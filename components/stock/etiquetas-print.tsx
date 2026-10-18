// components/stock/etiquetas-print.tsx — etiquetas de gondola para hoja A4 (3 por
// fila), impresas desde el navegador. Orden de lectura: oferta, nombre, precio,
// unidad; abajo codigo de barras y fecha del precio.
// Mismo criterio que components/pos/ticket-print.tsx: se renderiza siempre
// fuera de pantalla y solo se muestra al imprimir (ver #etiquetas-print en
// app/globals.css).
import { BarcodeEAN13 } from "@/components/stock/barcode-svg";
import { precioFinal, tieneOferta } from "@/lib/pricing";
import { etiquetaOfertaConUnidad } from "@/lib/oferta-analisis";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";
import type { Product } from "@/lib/types";
import { esFraccionable } from "@/lib/unidades";

const miles = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** $ 1.234,50 -> { entero: "1.234", centavos: "50" } (centavos null si son ,00). */
function partirPrecio(precio: number): { entero: string; centavos: string | null } {
  const total = Math.round(precio * 100);
  const cent = total % 100;
  return { entero: miles.format(Math.floor(total / 100)), centavos: cent ? String(cent).padStart(2, "0") : null };
}

function Precio({ valor }: { valor: number }) {
  const { entero, centavos } = partirPrecio(valor);
  return (
    <>
      <span className="etiqueta-signo">$</span>
      {entero}
      {centavos && <span className="etiqueta-centavos">,{centavos}</span>}
    </>
  );
}

/** "2026-10-18" -> "18/10/26" */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

export function EtiquetasPrint({ productos: todos }: { productos: Product[] }) {
  // Precio libre (recargas, "Varios"): no tiene precio que poner en la gondola.
  const productos = todos.filter((p) => !p.precioLibre);
  if (productos.length === 0) return null;
  const hoy = fechaCorta(hoyArgentinaISO());

  return (
    <div id="etiquetas-print">
      <div className="etiquetas-grid">
        {productos.map((p) => {
          const oferta = etiquetaOfertaConUnidad(p);
          const esCombo = p.ofertaTipo === "combo";
          const rebajado = tieneOferta(p) && !esCombo;
          const unidad = esFraccionable(p.unidad) ? `por ${p.unidad}` : esCombo ? "c/u" : null;
          return (
            <div key={p.id} className={rebajado || oferta ? "etiqueta etiqueta-con-oferta" : "etiqueta"}>
              {oferta && <p className="etiqueta-oferta">OFERTA {oferta}</p>}
              <p className="etiqueta-nombre">{p.name}</p>
              <div className="etiqueta-precio-bloque">
                {rebajado && (
                  <p className="etiqueta-antes">
                    Antes <s><Precio valor={p.price} /></s>
                  </p>
                )}
                <div className="etiqueta-precio-fila">
                  <p className="etiqueta-precio">
                    <Precio valor={esCombo ? p.price : precioFinal(p)} />
                  </p>
                  {unidad && <span className="etiqueta-unidad">{unidad}</span>}
                </div>
              </div>
              <div className="etiqueta-pie">
                {p.codigoBarras ? (
                  <span className="etiqueta-barras">
                    <BarcodeEAN13 codigo={p.codigoBarras} height={22} />
                    <span className="etiqueta-codigo">{p.codigoBarras}</span>
                  </span>
                ) : (
                  <span className="etiqueta-codigo">{p.codigo ? `Cód. ${p.codigo}` : ""}</span>
                )}
                <span className="etiqueta-fecha">Precio al {hoy}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
