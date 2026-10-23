"use client";

// hooks/use-datos-ticket.ts — encabezado del ticket (Mi comercio → Datos del ticket)
// para el POS. Se trae al abrir y queda guardado por comercio en esta PC: sin
// conexion el ticket sale igual con el logo y los datos de la ultima vez.
import { useEffect, useState } from "react";
import { consultar } from "@/services/api-client";
import { claveDelComercioActual } from "@/lib/clave-comercio";
import { datosTicketValidos, type DatosTicket } from "@/lib/ticket-negocio";

const CLAVE = "kiosko:datos-ticket";

function leerCache(): DatosTicket | null {
  try {
    const clave = claveDelComercioActual(CLAVE);
    const crudo = clave ? localStorage.getItem(clave) : null;
    return crudo ? datosTicketValidos(JSON.parse(crudo)) : null;
  } catch {
    return null;
  }
}

/** Lo llama Mi comercio al guardar, para que el POS de esta PC lo use ya. */
export function guardarDatosTicketEnCache(datos: DatosTicket) {
  try {
    const clave = claveDelComercioActual(CLAVE);
    if (clave) localStorage.setItem(clave, JSON.stringify(datos));
  } catch {
    // sin storage (modo privado): se vuelve a pedir al abrir el POS
  }
}

export function useDatosTicket(): DatosTicket | null {
  const [datos, setDatos] = useState<DatosTicket | null>(null);
  useEffect(() => {
    setDatos(leerCache());
    let vigente = true;
    consultar<{ ticket: DatosTicket }>("/api/consultas/comercio", "ticket")
      .then(({ ticket }) => {
        const d = datosTicketValidos(ticket);
        guardarDatosTicketEnCache(d);
        if (vigente) setDatos(d);
      })
      .catch(() => {
        // sin conexion: queda lo guardado
      });
    return () => {
      vigente = false;
    };
  }, []);
  return datos;
}
