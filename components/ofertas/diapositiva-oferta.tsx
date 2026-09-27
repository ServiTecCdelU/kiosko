// components/ofertas/diapositiva-oferta.tsx — una oferta a pantalla completa
// (medidas en vh/vw). La usan la pantalla de TV y la pantalla del cliente en reposo.
// Colores fijos de cartel: es señaletica, no parte del panel.
import { pesos } from "@/lib/pricing";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import { textoVigencia } from "@/lib/oferta-vigencia";
import type { Product } from "@/lib/types";

export function DiapositivaOferta({ p }: { p: Product }) {
  const a = analizarOferta(p);
  const etiqueta = etiquetaOferta(p);
  const esCombo = p.ofertaTipo === "combo";
  const porKg = p.unidad === "kg" ? "/kg" : "";
  return (
    <div className="flex h-full animate-in fade-in slide-in-from-right-8 flex-col items-center justify-center gap-[3vh] px-[5vw] text-center duration-700">
      {etiqueta && (
        <span
          className="-rotate-3 rounded-[2vh] px-[3vw] py-[1vh] font-black leading-none shadow-[1vh_1vh_0_#7a0a0e]"
          style={{ background: "#ffd400", color: "#d7141a", fontSize: esCombo ? "16vh" : "11vh" }}
        >
          {etiqueta}
        </span>
      )}
      <p className="line-clamp-2 max-w-[85vw] font-extrabold uppercase leading-tight text-white" style={{ fontSize: p.name.length > 30 ? "6vh" : "8vh" }}>
        {p.name}
      </p>
      <div className="leading-none">
        {esCombo ? (
          <p className="font-bold text-white/85" style={{ fontSize: "5vh" }}>Llevando {a.unidades}</p>
        ) : (
          <p className="text-white/70 line-through decoration-[#ffd400]" style={{ fontSize: "6vh" }}>{pesos(p.price)}{porKg}</p>
        )}
        <p className="font-black tracking-tight" style={{ color: "#ffd400", fontSize: "20vh" }}>
          {pesos(a.totalPromo)}<span style={{ fontSize: "6vh" }}>{porKg}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-[2vw]" style={{ fontSize: "3.6vh" }}>
        {a.ahorroTotal > 0 && (
          <span className="rounded-full bg-white px-[2vw] py-[0.6vh] font-extrabold" style={{ color: "#0f8a3c" }}>
            Ahorrás {pesos(a.ahorroTotal)}
          </span>
        )}
        <span className="font-semibold text-white/85">{textoVigencia(p.ofertaDesde, p.ofertaHasta)}</span>
      </div>
    </div>
  );
}
