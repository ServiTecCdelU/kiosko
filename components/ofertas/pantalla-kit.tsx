"use client";
// components/ofertas/pantalla-kit.tsx — piezas comunes de las pantallas de
// señaletica (TV de ofertas y pantalla del cliente): reloj y pantalla completa.
import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";

export function Reloj() {
  const [hora, setHora] = useState("");
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{hora}</span>;
}

export function usePantallaCompleta(): boolean {
  const [completa, setCompleta] = useState(false);
  useEffect(() => {
    const onChange = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return completa;
}

export function BotonPantallaCompleta() {
  return (
    <button
      onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
      className="absolute right-[2vw] top-[10vh] z-10 flex items-center gap-2 rounded-2xl bg-black/30 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-black/45"
    >
      <Maximize2 className="h-4 w-4" /> Pantalla completa
    </button>
  );
}
