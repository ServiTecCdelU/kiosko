"use client";
// app/ofertas-tv/page.tsx — pantalla de ofertas para una tele en el local:
// pasa las ofertas vigentes de a una, a pantalla completa, con un ticker abajo.
// Se abre desde el Centro de ofertas en una PC/TV con la sesion iniciada.
// Colores fijos (rojo/amarillo de cartel): es señaletica, no parte del panel.
import { useCallback, useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useNombreComercio } from "@/components/stock/oferta-publicada";
import { pesos, tieneOferta } from "@/lib/pricing";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import { textoVigencia } from "@/lib/oferta-vigencia";
import { getOfertas } from "@/services/products-service";
import type { Product } from "@/lib/types";

const SEGUNDOS_POR_OFERTA = 8;
const RECARGA_MS = 5 * 60 * 1000;

function Reloj() {
  const [hora, setHora] = useState("");
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{hora}</span>;
}

function Diapositiva({ p }: { p: Product }) {
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

function PantallaOfertas() {
  const [ofertas, setOfertas] = useState<Product[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [comercio] = useNombreComercio();
  const [completa, setCompleta] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const todas = await getOfertas();
      setOfertas(todas.map((o) => o.producto).filter((p) => tieneOferta(p)));
    } catch {
      // se reintenta en la proxima recarga; mientras, queda lo que habia
      setOfertas((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, RECARGA_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const total = ofertas?.length ?? 0;
  useEffect(() => {
    if (total < 2) return;
    const id = setInterval(() => setIndice((i) => (i + 1) % total), SEGUNDOS_POR_OFERTA * 1000);
    return () => clearInterval(id);
  }, [total]);

  useEffect(() => {
    const onChange = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const actual = ofertas && total > 0 ? ofertas[indice % total] : null;

  return (
    <main
      className="relative flex h-screen w-screen flex-col overflow-hidden text-white"
      style={{ background: "radial-gradient(120% 90% at 50% 20%, #e8202a 0%, #b30f16 55%, #6e070b 100%)", cursor: completa ? "none" : "auto" }}
    >
      <header className="flex items-center justify-between px-[4vw] pt-[3vh]" style={{ fontSize: "4vh" }}>
        <span className="font-black italic tracking-tight">¡OFERTAS!{comercio.trim() && <span className="ml-[1.5vw] font-bold not-italic text-white/80">{comercio.trim()}</span>}</span>
        <span className="flex items-center gap-[1.5vw] font-bold">
          {total > 1 && <span className="text-white/70" style={{ fontSize: "2.6vh" }}>{(indice % total) + 1} / {total}</span>}
          <Reloj />
        </span>
      </header>

      <section className="min-h-0 flex-1">
        {ofertas == null ? null : actual ? (
          <Diapositiva key={`${actual.id}-${indice}`} p={actual} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-[2vh] text-center">
            <p className="font-black" style={{ fontSize: "8vh" }}>Todavía no hay ofertas vigentes</p>
            <p className="text-white/75" style={{ fontSize: "3vh" }}>Creá una desde Stock → Oferta y aparece acá sola.</p>
          </div>
        )}
      </section>

      {total > 1 && (
        <div className="h-[0.8vh] w-full bg-black/20">
          <div key={indice} className="tv-progreso h-full origin-left" style={{ background: "#ffd400", animationDuration: `${SEGUNDOS_POR_OFERTA}s` }} />
        </div>
      )}

      {total > 0 && (
        <footer className="overflow-hidden whitespace-nowrap py-[1.6vh]" style={{ background: "#ffd400", color: "#b30f16", fontSize: "3.4vh" }}>
          <div className="tv-marquee inline-block font-extrabold" style={{ animationDuration: `${Math.max(20, total * 6)}s` }}>
            {[0, 1].map((copia) => (
              <span key={copia} aria-hidden={copia === 1}>
                {ofertas!.map((p) => (
                  <span key={p.id} className="mx-[2vw]">
                    ★ {p.name} <span className="text-black">{etiquetaOferta(p)}</span> {pesos(analizarOferta(p).totalPromo)}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </footer>
      )}

      {!completa && (
        <button
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="absolute right-[2vw] top-[10vh] flex items-center gap-2 rounded-2xl bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-black/45"
        >
          <Maximize2 className="h-4 w-4" /> Pantalla completa
        </button>
      )}
    </main>
  );
}

export default function OfertasTvPage() {
  return (
    <AuthGuard>
      <PantallaOfertas />
    </AuthGuard>
  );
}
