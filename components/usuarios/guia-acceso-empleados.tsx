"use client";

// components/usuarios/guia-acceso-empleados.tsx — guia para el DUEÑO: que tiene
// que hacer para que un cajero/encargado pueda entrar a su cuenta. Cada paso se
// tilda solo con datos reales (cajas, empleados, PCs registradas, primer
// ingreso con PIN). Se muestra en Empleados y en Caja: el dueño no sabe que la
// PC del mostrador se registra una vez, y que eso lo hace él, no el empleado.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Check, ChevronDown, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPuestos } from "@/services/caja-service";
import { getUsuarios } from "@/services/usuarios-service";
import { listarPcs } from "@/services/dispositivo-service";
import { LARGO_PIN } from "@/lib/pin";

interface Estado {
  caja: boolean;
  empleado: boolean;
  pc: boolean;
  ingreso: boolean;
}

interface Paso {
  id: keyof Estado;
  titulo: string;
  detalle: React.ReactNode;
  href?: string;
  accion?: string;
}

const PASOS: Paso[] = [
  {
    id: "caja",
    titulo: "Tener una caja",
    detalle: <>Cada puesto de cobro es una caja (ej. “Caja 1”). Se crea en <b>Caja → Puestos…</b></>,
    href: "/caja",
    accion: "Ir a Caja",
  },
  {
    id: "empleado",
    titulo: "Crear al empleado con su PIN",
    detalle: (
      <>En <b>Empleados → Nuevo empleado</b>, con un PIN de {LARGO_PIN} números. Dáselo en persona: es su clave
        para entrar y las ventas quedan a su nombre.</>
    ),
    href: "/usuarios",
    accion: "Empleados",
  },
  {
    id: "pc",
    titulo: "Registrar la PC del mostrador (lo hacés vos, una sola vez)",
    detalle: (
      <>Sentate en <b>la computadora donde va a cobrar el empleado</b>, entrá vos con Google y andá a{" "}
        <b>Caja → PCs… → Registrar esta PC</b>. El empleado no puede hacerlo: es un permiso del dueño. Sin este paso
        el PIN no funciona, así nadie entra desde otro lugar.</>
    ),
    href: "/caja",
    accion: "Ir a Caja",
  },
  {
    id: "ingreso",
    titulo: "El empleado entra con su PIN",
    detalle: (
      <>En esa misma PC <b>cerrá tu sesión</b> (botón Salir, junto a tu nombre). En la pantalla de ingreso el empleado
        toca <b>“Soy empleado”</b>, pone su PIN y entra directo al Punto de Venta de esa caja. Desde ahí, cada día
        repite solo este paso.</>
    ),
  },
];

async function leerEstado(): Promise<Estado> {
  const [puestos, usuarios, pcs] = await Promise.all([getPuestos(), getUsuarios(), listarPcs()]);
  return {
    caja: puestos.some((p) => p.activo),
    empleado: usuarios.some((u) => u.rol !== "admin" && u.activo),
    pc: pcs.length > 0,
    ingreso: pcs.some((p) => !!p.ultimoUso),
  };
}

interface GuiaAccesoEmpleadosProps {
  /** Cambia cuando la pantalla guarda algo (se vuelven a leer los pasos). */
  version?: number;
  /** Ocultar la guia cuando ya esta todo hecho (en Caja no hace falta verla siempre). */
  ocultarSiCompleta?: boolean;
}

export function GuiaAccesoEmpleados({ version = 0, ocultarSiCompleta = false }: GuiaAccesoEmpleadosProps) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [abierta, setAbierta] = useState<boolean | null>(null);
  const pathname = usePathname();

  const cargar = useCallback(() => {
    leerEstado().then(setEstado).catch(() => setEstado(null)); // es una ayuda: si falla, no se muestra
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  if (!estado) return null;
  const hechos = PASOS.filter((p) => estado[p.id]).length;
  const completa = hechos === PASOS.length;
  if (completa && ocultarSiCompleta) return null;
  // Abierta mientras falte algo; ya completa, plegada (se puede abrir para repasar).
  const verPasos = abierta ?? !completa;
  const siguiente = PASOS.find((p) => !estado[p.id])?.id;

  return (
    <section className="card-premium mb-4 rounded-2xl" aria-labelledby="guia-acceso-titulo">
      <button
        type="button"
        onClick={() => setAbierta(!verPasos)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={verPasos}
      >
        <span className="flex items-center gap-3">
          <span className="grad-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
            <KeyRound className="h-4 w-4" />
          </span>
          <span>
            <span id="guia-acceso-titulo" className="block text-sm font-semibold">¿Cómo entra un empleado a su cuenta?</span>
            <span className="block text-xs text-muted-foreground">
              {completa ? "Todo listo: tus empleados ya entran con su PIN." : `${hechos} de ${PASOS.length} pasos listos`}
            </span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", verPasos && "rotate-180")} />
      </button>

      {verPasos && (
        <ol className="divide-y border-t px-4">
          {PASOS.map((p, i) => {
            const hecho = estado[p.id];
            const actual = p.id === siguiente;
            return (
              <li key={p.id} className="flex gap-3 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                    hecho
                      ? "border-primary bg-primary text-primary-foreground"
                      : actual
                        ? "border-primary text-primary"
                        : "border-muted-foreground/30 text-muted-foreground",
                  )}
                  aria-label={hecho ? "Listo" : "Pendiente"}
                >
                  {hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", hecho && "text-muted-foreground")}>
                    {p.titulo}
                    {actual && <span className="ml-2 text-[11px] font-semibold uppercase text-primary">te falta este</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground [&_b]:text-foreground">{p.detalle}</p>
                </div>
                {actual && p.href && p.href !== pathname && (
                  <Link
                    href={p.href}
                    className="inline-flex h-fit shrink-0 items-center gap-1 self-center rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
                  >
                    {p.accion} <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
