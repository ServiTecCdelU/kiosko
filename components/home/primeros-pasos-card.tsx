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

// opcional: no cuenta para el progreso ni para dar la guia por terminada (quien
// atiende solo nunca suma cajeros y la tarjeta quedaba en "2 de 3" para siempre).
const PASOS: { id: keyof Pasos; titulo: string; detalle: string; href: string; accion: string; opcional?: boolean }[] = [
  // ?tipicos=1 abre los productos tipicos del rubro del alta (lib/rubros-perfil.ts).
  { id: "productos", titulo: "Cargá tus productos", detalle: "Empezá con los típicos de tu rubro, ya configurados, o importá tu lista de Excel.", href: "/stock?tipicos=1", accion: "Empezar" },
  { id: "venta", titulo: "Hacé tu primera venta", detalle: "Abrí la caja y cobrá desde el Punto de Venta.", href: "/pos", accion: "Vender" },
  { id: "cajeros", titulo: "Sumá a tus cajeros", detalle: "Crealos con su PIN y registrá la PC de la caja: ahí entran con “Soy empleado”.", href: "/usuarios", accion: "Empleados", opcional: true },
  { id: "mercadoPago", titulo: "Conectá Mercado Pago", detalle: "Cobrá con QR y lector Point (está en Facturación).", href: "/facturacion#mercado-pago", accion: "Conectar" },
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
  const [conMercadoPago, setConMercadoPago] = useState(true);
  const [oculta, setOculta] = useState(true);

  useEffect(() => {
    if (leerOculta()) return;
    setOculta(false);
    consultar<{ mostrar: boolean; pasos: Pasos; incluyeMercadoPago?: boolean }>("/api/consultas/primeros-pasos", "estado")
      .then((r) => {
        setPasos(r.mostrar ? r.pasos : null);
        setConMercadoPago(r.incluyeMercadoPago !== false);
      })
      .catch(() => setPasos(null)); // es una ayuda: si falla, no se muestra
  }, []);

  if (oculta || !pasos) return null;
  // Plan Basico: sin Mercado Pago, ese paso no se puede completar.
  const visibles = PASOS.filter((p) => p.id !== "mercadoPago" || conMercadoPago);
  const obligatorios = visibles.filter((p) => !p.opcional);
  const hechos = obligatorios.filter((p) => pasos[p.id]).length;
  if (hechos === obligatorios.length) return null;

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
            <p className="text-xs text-muted-foreground">{hechos} de {obligatorios.length} listos</p>
          </div>
        </div>
        <button onClick={ocultar} className="text-muted-foreground/70 hover:text-foreground" aria-label="Ocultar primeros pasos">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="grad-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${(hechos / obligatorios.length) * 100}%` }} />
      </div>

      <ol className="mt-4 divide-y">
        {visibles.map((p) => {
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
                <p className={cn("text-sm font-medium", hecho && "text-muted-foreground line-through")}>
                  {p.titulo}
                  {p.opcional && !hecho && (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Opcional</span>
                  )}
                </p>
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
