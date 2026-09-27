// components/stock/cartel-oferta.tsx — cartel de oferta (A4, A5 o A6) para pegar en la
// gondola o la vidriera. Todo esta medido en `em`: el mismo componente se usa
// como vista previa chica dentro del estudio de ofertas y, con otro font-size,
// para imprimir (#cartel-print en app/globals.css).
// Los colores salen del tema de temporada (lib/cartel-temas.ts), no del tema claro/oscuro:
// es papel, no pantalla.
import type { CSSProperties } from "react";
import { pesos } from "@/lib/pricing";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import { textoVigencia } from "@/lib/oferta-vigencia";
import { tamanoTitulo, temaCartel, type TemaCartelId } from "@/lib/cartel-temas";
import { FORMATOS_CARTEL, type FormatoCartel } from "@/components/stock/cartel-preferencias";
import type { Product } from "@/lib/types";

const VERDE = "#0f8a3c";

/** Tamaño de letra (em) para que un texto de `largo` caracteres entre en `ancho` em. */
function ajustar(largo: number, ancho: number, max: number): string {
  return `${Math.min(max, ancho / Math.max(largo * 0.58, 1))}em`;
}

interface CartelOfertaProps {
  producto: Product;
  comercio?: string;
  tema?: TemaCartelId;
  style?: CSSProperties;
}

export function CartelOferta({ producto, comercio, tema, style }: CartelOfertaProps) {
  const t = temaCartel(tema);
  const a = analizarOferta(producto);
  const etiqueta = etiquetaOferta(producto);
  const esCombo = producto.ofertaTipo === "combo";
  const porKg = producto.unidad === "kg" ? "/kg" : "";
  const precioGrande = pesos(a.totalPromo);

  return (
    <div
      style={{
        width: "40em", height: "56.5em", boxSizing: "border-box", overflow: "hidden",
        display: "flex", flexDirection: "column", background: "#fff", color: "#111",
        border: `0.4em solid ${t.principal}`, fontFamily: "inherit",
        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
        ...style,
      }}
    >
      <div
        style={{
          background: t.principal, color: "#fff", textAlign: "center", padding: "1.2em 0 1em",
          fontSize: "1em", fontWeight: 900, fontStyle: "italic", letterSpacing: "0.02em",
        }}
      >
        <span style={{ fontSize: `${tamanoTitulo(t.titulo, 36, 7)}em`, lineHeight: 1, whiteSpace: "nowrap" }}>{t.titulo}</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-evenly", padding: "1.5em 2em", textAlign: "center" }}>
        {etiqueta && (
          <div
            style={{
              // Relleno, radio y sombra en em de la PROPIA letra del badge (que es enorme):
              // valores chicos, o el badge crece hasta tapar el nombre
              background: t.badgeFondo, color: t.badgeTexto, borderRadius: "0.18em", padding: "0.06em 0.28em",
              fontWeight: 900, lineHeight: 1.05, transform: "rotate(-3deg)",
              boxShadow: `0.05em 0.05em 0 ${t.profundo}`,
              fontSize: ajustar(etiqueta.length, 30, esCombo ? 8 : 6),
            }}
          >
            {etiqueta}
          </div>
        )}

        <p
          style={{
            margin: 0, fontWeight: 800, textTransform: "uppercase", lineHeight: 1.1,
            fontSize: producto.name.length > 40 ? "2.2em" : "2.8em",
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {producto.name}
        </p>

        <div style={{ lineHeight: 1 }}>
          {esCombo ? (
            <p style={{ margin: 0, fontSize: "2.4em", fontWeight: 700 }}>Llevando {a.unidades}</p>
          ) : (
            <p style={{ margin: 0, fontSize: "2.6em", color: "#666", textDecoration: "line-through", textDecorationColor: t.principal, textDecorationThickness: "0.1em" }}>
              {pesos(producto.price)}{porKg}
            </p>
          )}
          <p style={{ margin: "0.05em 0 0", fontWeight: 900, letterSpacing: "-0.03em", fontSize: ajustar(precioGrande.length + porKg.length, 36, 11) }}>
            {precioGrande}
            {porKg && <span style={{ fontSize: "0.35em", fontWeight: 700 }}>{porKg}</span>}
          </p>
          {esCombo && (
            <p style={{ margin: "0.3em 0 0", fontSize: "1.8em", color: "#444" }}>
              {pesos(a.precioUnitario)} c/u · antes {pesos(producto.price)} c/u
            </p>
          )}
        </div>

        {a.ahorroTotal > 0 && (
          <div style={{ background: VERDE, color: "#fff", borderRadius: "999px", padding: "0.35em 1.2em", fontSize: "2.2em", fontWeight: 800 }}>
            Ahorrás {pesos(a.ahorroTotal)}
          </div>
        )}
      </div>

      <div style={{ borderTop: `0.15em dashed ${t.principal}`, padding: "0.9em 2em", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "1.4em", fontWeight: 600 }}>
        <span>{comercio || " "}</span>
        <span style={{ color: producto.ofertaHasta ? t.principal : "#555", fontWeight: producto.ofertaHasta ? 800 : 600 }}>
          {textoVigencia(producto.ofertaDesde, producto.ofertaHasta)}
        </span>
      </div>
    </div>
  );
}

/**
 * Carteles para imprimir en hojas A4: 1 por hoja, 2 (media hoja, hoja apaisada)
 * o 4 (cuarto de hoja). Fuera de pantalla hasta window.print().
 */
export function CartelOfertaPrint({ productos, comercio, formato = "a4", tema }: {
  productos: Product[];
  comercio?: string;
  formato?: FormatoCartel;
  tema?: TemaCartelId;
}) {
  if (productos.length === 0) return null;
  const porHoja = FORMATOS_CARTEL.find((f) => f.value === formato)?.porHoja ?? 1;
  const hojas: Product[][] = [];
  for (let i = 0; i < productos.length; i += porHoja) hojas.push(productos.slice(i, i + porHoja));
  return (
    <div id="cartel-print">
      {hojas.map((hoja, i) => (
        <div key={i} className={`cartel-hoja cartel-${formato}`}>
          {hoja.map((p) => (
            <div key={p.id} className="cartel-celda">
              <CartelOferta producto={p} comercio={comercio} tema={tema} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
