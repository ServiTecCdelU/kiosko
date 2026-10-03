"use client";

// components/home/primeros-pasos-card.tsx — guia del comercio recien creado por
// el autoregistro. Cada paso se tilda solo (app/api/consultas/primeros-pasos);
// la tarjeta desaparece al completar todo o si el dueño la oculta.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { consultar } from "@/services/api-client";
import { claveDelComercioActual } from "@/lib/clave-comercio";

interface Pasos {
  productos: boolean;
  venta: boolean;
  cajeros: boolean;
  mercadoPago: boolean;
}

const PASOS: { id: keyof Pasos; titulo: string; detalle: string; href: string; accion: string }[] = [
  { id: "productos", titulo: "Cargá tus productos", detalle: "Importalos desde Excel o cargalos a mano.", href: "/stock", accion: "Ir a Stock" },
  { id: "venta", titulo: "Hacé tu primera venta", detalle: "Abrí la caja y cobrá desde el Punto de Venta.", href: "/pos", accion: "Vender" },
  { id: "cajeros", titulo: "Sumá a tus cajeros", detalle: "Cada uno entra con su PIN y su caja.", href: "/usuarios", accion: "Empleados" },
  { id: "mercadoPago", titulo: "Conectá Mercado Pago", detalle: "Cobrá con QR y lector Point.", href: "#mercado-pago", accion: "Conectar" },
];

const CLAVE_OCULTA = "kiosko_primeros_pasos_oculta";

function leerOculta(): boolean {
  try {
    const clave = claveDelComercioActual(CLAVE_OCULTA);
    return !!clave && localStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
}

export function PrimerosPasosCard() {
  const [pasos, setPasos] = useState<Pasos | null>(null);
  const [oculta, setOculta] = useState(true);

  useEffect(() => {
    if (leerOculta()) return;
    setOculta(false);
    consultar<{ mostrar: boolean; pasos: Pasos }>("/api/consultas/primeros-pasos", "estado")
      .then((r) => setPasos(r.mostrar ? r.pasos : null))
      .catch(() => setPasos(null)); // es una ayuda: si falla, no se muestra
  }, []);

  if (oculta || !pasos) return null;
  const hechos = PASOS.filter((p) => pasos[p.id]).length;
  if (hechos === PASOS.length) return null;

  const ocultar = () => {
    setOculta(true);
    try {
      const clave = claveDelComercioActual(CLAVE_OCULTA);
      if (clave) localStorage.setItem(clave, "1");
    } catch {
      // sin almacenamiento: se oculta solo por esta vez
    }
  };

  return (
    <section className="card-premium rounded-2xl p-5" aria-labelledby="primeros-pasos-titulo">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grad-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h3 id="primeros-pasos-titulo" className="font-semibold text-foreground">Primeros pasos</h3>
            <p className="text-xs text-muted-foreground">{hechos} de {PASOS.length} listos</p>
          </div>
        </div>
        <button onClick={ocultar} className="text-muted-foreground/70 hover:text-foreground" aria-label="Ocultar primeros pasos">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="grad-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${(hechos / PASOS.length) * 100}%` }} />
      </div>

      <ol className="mt-4 divide-y">
        {PASOS.map((p) => {
          const hecho = pasos[p.id];
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  hecho ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
                )}
                aria-label={hecho ? "Listo" : "Pendiente"}
              >
                {hecho && <Check className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", hecho && "text-muted-foreground line-through")}>{p.titulo}</p>
                {!hecho && <p className="text-xs text-muted-foreground">{p.detalle}</p>}
              </div>
              {!hecho && (
                <Link
                  href={p.href}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
                >
                  {p.accion} <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
