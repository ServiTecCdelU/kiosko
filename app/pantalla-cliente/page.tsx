"use client";
// app/pantalla-cliente/page.tsx — 2do monitor mirando al cliente. Mientras se
// cobra muestra lo que va entrando, el total y cuanto ahorra con ofertas; al
// cerrar la venta, "¡Gracias!"; con la caja libre, pasa las ofertas vigentes.
// El POS le habla por BroadcastChannel (hooks/use-pantalla-cliente.ts): tiene que
// estar abierta en la misma PC y el mismo navegador que el POS.
// Colores fijos: es señaletica, no parte del panel.
import { useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useNombreComercio } from "@/components/stock/oferta-publicada";
import { DiapositivaOferta } from "@/components/ofertas/diapositiva-oferta";
import { BotonPantallaCompleta, Reloj, usePantallaCompleta } from "@/components/ofertas/pantalla-kit";
import { useOfertasVigentes, useRotacion } from "@/hooks/use-ofertas-vigentes";
import { abrirCanalPantalla, type LineaPantalla, type MensajePantalla } from "@/hooks/use-pantalla-cliente";
import { pesos } from "@/lib/pricing";
import { analizarOferta, etiquetaOferta } from "@/lib/oferta-analisis";
import type { Product } from "@/lib/types";

const AMARILLO = "#ffd400";
const VERDE = "#22c55e";
const SEGUNDOS_GRACIAS = 7;
const SEGUNDOS_POR_OFERTA = 7;

type Estado =
  | { modo: "libre" }
  | { modo: "carrito"; lineas: LineaPantalla[]; total: number; ahorro: number }
  | { modo: "gracias"; total: number; ahorro: number };

interface CarritoProps {
  lineas: LineaPantalla[];
  total: number;
  ahorro: number;
  ofertas: Product[];
}

function Carrito({ lineas, total, ahorro, ofertas }: CarritoProps) {
  const lista = useRef<HTMLUListElement>(null);
  const enCarrito = new Set(lineas.map((l) => l.id));
  // "¿Viste esta?": ofertas que el cliente todavia no lleva
  const otras = ofertas.filter((p) => !enCarrito.has(p.id));
  const i = useRotacion(otras.length, SEGUNDOS_POR_OFERTA);
  const sugerida = otras[i];

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [lineas.length]);

  return (
    <div className="grid h-full grid-cols-[1.4fr_1fr] gap-[2vw] p-[2.5vw]" style={{ background: "#0b1220" }}>
      <ul ref={lista} className="space-y-[1vh] overflow-y-auto pr-[1vw]">
        {lineas.map((l) => (
          <li key={l.id} className="flex animate-in fade-in slide-in-from-bottom-2 items-center gap-[1.2vw] rounded-[1.5vh] bg-white/5 px-[1.5vw] py-[1.4vh] duration-300">
            <span className="min-w-[4.5vw] font-bold text-white/60" style={{ fontSize: "2.8vh" }}>
              {l.unidad === "kg" ? `${l.cantidad.toFixed(2)}kg` : `${l.cantidad}x`}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 font-semibold text-white" style={{ fontSize: "3vh" }}>{l.nombre}</span>
              {l.ahorro > 0 && (
                <span className="font-semibold" style={{ color: VERDE, fontSize: "2.2vh" }}>
                  {l.etiqueta} · ahorrás {pesos(l.ahorro)}
                </span>
              )}
            </span>
            <span className="cifra font-bold text-white" style={{ fontSize: "3.2vh" }}>{pesos(l.subtotal)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-[2vh]">
        <div className="flex flex-1 flex-col justify-center rounded-[2.5vh] p-[2vw]" style={{ background: "#111a2e" }}>
          <span className="font-bold uppercase tracking-widest text-white/60" style={{ fontSize: "2.6vh" }}>Total</span>
          <span className="cifra font-black leading-none text-white" style={{ fontSize: "12vh" }}>{pesos(total)}</span>
          {ahorro >= 1 && (
            <span className="mt-[2vh] animate-in zoom-in-95 self-start rounded-full px-[1.6vw] py-[0.8vh] font-extrabold text-[#052e14] duration-300" style={{ background: VERDE, fontSize: "3.2vh" }}>
              🎉 Ahorrás {pesos(ahorro)} con ofertas
            </span>
          )}
        </div>
        {sugerida && (
          <div key={sugerida.id} className="animate-in fade-in rounded-[2.5vh] p-[1.6vw] duration-500" style={{ background: "#d7141a" }}>
            <p className="font-bold text-white/80" style={{ fontSize: "2.2vh" }}>¿Ya viste esta oferta?</p>
            <div className="flex items-center justify-between gap-[1vw]">
              <span className="line-clamp-2 font-extrabold uppercase text-white" style={{ fontSize: "2.8vh" }}>{sugerida.name}</span>
              <span className="shrink-0 text-right leading-none">
                <span className="block rounded-[1vh] px-[0.8vw] py-[0.4vh] font-black" style={{ background: AMARILLO, color: "#d7141a", fontSize: "2.8vh" }}>
                  {etiquetaOferta(sugerida)}
                </span>
                <span className="font-black" style={{ color: AMARILLO, fontSize: "4vh" }}>{pesos(analizarOferta(sugerida).totalPromo)}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Gracias({ total, ahorro }: { total: number; ahorro: number }) {
  return (
    <div className="flex h-full animate-in fade-in zoom-in-95 flex-col items-center justify-center gap-[3vh] text-center duration-500" style={{ background: "#0b1220" }}>
      <p className="font-black text-white" style={{ fontSize: "10vh" }}>¡Gracias por tu compra!</p>
      <p className="cifra font-bold text-white/70" style={{ fontSize: "4vh" }}>Total {pesos(total)}</p>
      {ahorro >= 1 && (
        <p className="rounded-full px-[3vw] py-[1.2vh] font-black text-[#052e14]" style={{ background: VERDE, fontSize: "6vh" }}>
          Hoy ahorraste {pesos(ahorro)} 🎉
        </p>
      )}
    </div>
  );
}

function Libre({ comercio, ofertas }: { comercio: string; ofertas: Product[] }) {
  const indice = useRotacion(ofertas.length, SEGUNDOS_POR_OFERTA);
  const actual = ofertas[indice];
  return (
    <div className="flex h-full flex-col" style={{ background: "radial-gradient(120% 90% at 50% 20%, #e8202a 0%, #b30f16 55%, #6e070b 100%)" }}>
      {actual ? (
        <>
          <p className="pt-[3vh] text-center font-black italic text-white" style={{ fontSize: "4.5vh" }}>
            ¡Bienvenido{comercio ? ` a ${comercio}` : ""}! · Ofertas de hoy
          </p>
          <div className="min-h-0 flex-1"><DiapositivaOferta key={`${actual.id}-${indice}`} p={actual} /></div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-center">
          <p className="font-black text-white" style={{ fontSize: "9vh" }}>¡Bienvenido{comercio ? ` a ${comercio}` : ""}!</p>
        </div>
      )}
    </div>
  );
}

function PantallaCliente() {
  const [estado, setEstado] = useState<Estado>({ modo: "libre" });
  const ofertas = useOfertasVigentes() ?? [];
  const [comercio] = useNombreComercio();
  const completa = usePantallaCompleta();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canal = abrirCanalPantalla();
    if (!canal) return;
    canal.onmessage = (e: MessageEvent<MensajePantalla>) => {
      const m = e.data;
      if (m?.tipo === "gracias") {
        if (timer.current) clearTimeout(timer.current);
        setEstado({ modo: "gracias", total: m.total, ahorro: m.ahorro });
        timer.current = setTimeout(() => setEstado({ modo: "libre" }), SEGUNDOS_GRACIAS * 1000);
      } else if (m?.tipo === "carrito") {
        if (m.lineas.length > 0) {
          if (timer.current) clearTimeout(timer.current);
          setEstado({ modo: "carrito", lineas: m.lineas, total: m.total, ahorro: m.ahorro });
        } else {
          // El carrito vacio que llega justo despues del "gracias" no lo tapa
          setEstado((prev) => (prev.modo === "gracias" ? prev : { modo: "libre" }));
        }
      }
    };
    canal.postMessage({ tipo: "hola" } satisfies MensajePantalla);
    return () => {
      canal.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const nombre = comercio.trim();
  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden" style={{ cursor: completa ? "none" : "auto" }}>
      {estado.modo !== "libre" && (
        <header className="flex items-center justify-between px-[2.5vw] py-[1.5vh] font-bold text-white" style={{ background: "#0b1220", fontSize: "2.8vh" }}>
          <span>{nombre || "¡Hola!"}</span>
          <Reloj />
        </header>
      )}
      <section className="min-h-0 flex-1">
        {estado.modo === "carrito" && <Carrito lineas={estado.lineas} total={estado.total} ahorro={estado.ahorro} ofertas={ofertas} />}
        {estado.modo === "gracias" && <Gracias total={estado.total} ahorro={estado.ahorro} />}
        {estado.modo === "libre" && <Libre comercio={nombre} ofertas={ofertas} />}
      </section>
      {!completa && <BotonPantallaCompleta />}
    </main>
  );
}

export default function PantallaClientePage() {
  return (
    <AuthGuard>
      <PantallaCliente />
    </AuthGuard>
  );
}
