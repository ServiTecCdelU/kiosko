"use client";

// hooks/use-cantidad-con-lector.ts — campo de cantidad donde tambien puede escanear el lector
// (Sumar stock y Recuento). El lector tipea mucho mas rapido que una persona: por la
// rafaga se sabe que habia en el campo antes de que empezara a escanear, y con eso
// leerEntradaCantidad (lib/escaneo-stock.ts) separa la cantidad del codigo.
import { useRef, useState } from "react";

/** Mas rapido que esto entre tecla y tecla es el lector, no una persona. */
const MS_RAFAGA = 40;

export function useCantidadConLector(inicial = "") {
  const [valor, setValor] = useState(inicial);
  // Lo que tenia el campo antes de que el lector empezara a tipear encima.
  const confirmada = useRef(inicial);
  const ultimaTecla = useRef(0);
  const previo = useRef(inicial);
  const enRafaga = useRef(false);

  /** onChange del input. */
  const cambiar = (nuevo: string) => {
    const ahora = Date.now();
    const rapido = ahora - ultimaTecla.current < MS_RAFAGA;
    if (rapido && !enRafaga.current) {
      confirmada.current = previo.current;
      enRafaga.current = true;
    }
    if (!rapido) {
      enRafaga.current = false;
      previo.current = valor;
    }
    ultimaTecla.current = ahora;
    setValor(nuevo);
  };

  /** Pone un valor desde el codigo (al abrir, o al sumar uno por escanear de nuevo). */
  const fijar = (nuevo: string) => {
    setValor(nuevo);
    confirmada.current = nuevo;
    previo.current = nuevo;
    enRafaga.current = false;
  };

  return { valor, cambiar, fijar, antes: () => confirmada.current };
}
