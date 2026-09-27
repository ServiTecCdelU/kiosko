"use client";
// app/ofertas-tv/page.tsx — pantalla de ofertas para una tele en el local:
// pasa las ofertas vigentes de a una, a pantalla completa, con un ticker abajo.
// Se abre desde el Centro de ofertas en una PC/TV con la sesion iniciada.
// Colores fijos (rojo/amarillo de cartel): es señaletica, no parte del panel.
import { AuthGuard } from "@/components/auth/auth-guard";
import { useNombreComercio } from "@/components/stock/oferta-publicada";
import { pesos } from "@/lib/pricing";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import { DiapositivaOferta } from "@/components/ofertas/diapositiva-oferta";
import { BotonPantallaCompleta, Reloj, usePantallaCompleta } from "@/components/ofertas/pantalla-kit";
import { useOfertasVigentes, useRotacion } from "@/hooks/use-ofertas-vigentes";

const SEGUNDOS_POR_OFERTA = 8;

function PantallaOfertas() {
  const ofertas = useOfertasVigentes();
  const total = ofertas?.length ?? 0;
  const indice = useRotacion(total, SEGUNDOS_POR_OFERTA);
  const [comercio] = useNombreComercio();
  const completa = usePantallaCompleta();
  const actual = ofertas && total > 0 ? ofertas[indice] : null;

  return (
    <main
      className="relative flex h-screen w-screen flex-col overflow-hidden text-white"
      style={{ background: "radial-gradient(120% 90% at 50% 20%, #e8202a 0%, #b30f16 55%, #6e070b 100%)", cursor: completa ? "none" : "auto" }}
    >
      <header className="flex items-center justify-between px-[4vw] pt-[3vh]" style={{ fontSize: "4vh" }}>
        <span className="font-black italic tracking-tight">¡OFERTAS!{comercio.trim() && <span className="ml-[1.5vw] font-bold not-italic text-white/80">{comercio.trim()}</span>}</span>
        <span className="flex items-center gap-[1.5vw] font-bold">
          {total > 1 && <span className="text-white/70" style={{ fontSize: "2.6vh" }}>{indice + 1} / {total}</span>}
          <Reloj />
        </span>
      </header>

      <section className="min-h-0 flex-1">
        {ofertas == null ? null : actual ? (
          <DiapositivaOferta key={`${actual.id}-${indice}`} p={actual} />
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

      {!completa && <BotonPantallaCompleta />}
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
