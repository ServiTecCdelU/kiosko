// components/stock/folleto-ofertas.tsx — folleto A4 "Ofertas de la semana":
// todas las ofertas en una grilla de 2 x 4 por hoja, para la puerta, la caja o
// para repartir. Solo se imprime (#folleto-print en app/globals.css); los colores
// salen del tema de temporada, igual que el cartel.
import { pesos } from "@/lib/pricing";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import { textoVigencia } from "@/lib/oferta-vigencia";
import { temaCartel, type TemaCartel, type TemaCartelId } from "@/lib/cartel-temas";
import type { Product } from "@/lib/types";

const POR_HOJA = 8;

function Tarjeta({ p, t }: { p: Product; t: TemaCartel }) {
  const a = analizarOferta(p);
  const etiqueta = etiquetaOferta(p);
  const esCombo = p.ofertaTipo === "combo";
  const porKg = p.unidad === "kg" ? "/kg" : "";
  return (
    <div
      style={{
        border: `0.6mm solid ${t.principal}`, borderRadius: "3mm", padding: "3mm 4mm", height: "56mm",
        boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between",
        textAlign: "center", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span style={{ background: t.badgeFondo, color: t.badgeTexto, fontWeight: 900, fontSize: "15pt", borderRadius: "2mm", padding: "0.5mm 3mm" }}>
          {etiqueta}
        </span>
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: "11pt", textTransform: "uppercase", lineHeight: 1.1, maxHeight: "2.3em", overflow: "hidden" }}>
        {p.name}
      </p>
      <div style={{ lineHeight: 1 }}>
        <p style={{ margin: 0, fontSize: "9pt", color: "#555", textDecoration: esCombo ? "none" : "line-through" }}>
          {esCombo ? `Llevando ${a.unidades}` : `${pesos(p.price)}${porKg}`}
        </p>
        <p style={{ margin: "1mm 0 0", fontWeight: 900, fontSize: "26pt", letterSpacing: "-0.02em" }}>
          {pesos(a.totalPromo)}<span style={{ fontSize: "10pt" }}>{porKg}</span>
        </p>
      </div>
      <p style={{ margin: 0, fontSize: "8pt", color: p.ofertaHasta ? t.principal : "#666", fontWeight: 700 }}>
        {textoVigencia(p.ofertaDesde, p.ofertaHasta)}
      </p>
    </div>
  );
}

export function FolletoOfertasPrint({ productos, comercio, tema }: { productos: Product[]; comercio?: string; tema?: TemaCartelId }) {
  if (productos.length === 0) return null;
  const t = temaCartel(tema);
  // El clasico dice "¡OFERTAS!" en plural; los de temporada usan su titulo
  const titulo = t.id === "clasico" ? "¡OFERTAS!" : t.titulo;
  const hojas: Product[][] = [];
  for (let i = 0; i < productos.length; i += POR_HOJA) hojas.push(productos.slice(i, i + POR_HOJA));

  return (
    <div id="folleto-print">
      {hojas.map((hoja, i) => (
        <div key={i} className="folleto-hoja" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact", color: "#111" }}>
          <div style={{ background: t.principal, color: "#fff", borderRadius: "3mm", padding: "4mm 6mm", marginBottom: "5mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "30pt", fontWeight: 900, fontStyle: "italic", lineHeight: 1 }}>{titulo}</span>
            <span style={{ fontSize: "13pt", fontWeight: 700, textAlign: "right" }}>
              {comercio || "de la semana"}
              {hojas.length > 1 && <span style={{ display: "block", fontSize: "9pt", opacity: 0.85 }}>Hoja {i + 1} de {hojas.length}</span>}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm" }}>
            {hoja.map((p) => <Tarjeta key={p.id} p={p} t={t} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
