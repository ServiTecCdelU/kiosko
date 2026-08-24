"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ShoppingCart,
  Wallet,
  Package,
  BarChart3,
  Store,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Users,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/hooks/use-auth";
import { visibleNavItems } from "@/lib/nav";
import { getReporte } from "@/services/reportes-service";
import { getCajaAbierta } from "@/services/caja-service";
import { getProductsPage } from "@/services/products-service";
import { formatCurrency, formatTime } from "@/lib/utils/format";
import type { Caja, UserRol } from "@/lib/types";

const ICONS: Record<string, typeof ShoppingCart> = {
  "/pos": ShoppingCart,
  "/caja": Wallet,
  "/clientes": Users,
  "/stock": Package,
  "/reportes": BarChart3,
  "/sincronizacion": RefreshCw,
};

const SUBTITLES: Record<string, string> = {
  "/pos": "Escaneá, cobrá y listo",
  "/caja": "Apertura, cierre y arqueo",
  "/clientes": "Fiado y cuenta corriente",
  "/stock": "Inventario y alertas",
  "/reportes": "Ventas, márgenes y más vendidos",
  "/sincronizacion": "Catálogo de la distribuidora",
};

// Fondo atmosférico: mesh de gradientes teal/lima muy sutil.
const MESH_BACKGROUND =
  "radial-gradient(at 18% 8%, oklch(0.62 0.14 220 / 0.12), transparent 50%)," +
  "radial-gradient(at 82% 0%, oklch(0.78 0.18 150 / 0.10), transparent 45%)," +
  "radial-gradient(at 50% 100%, oklch(0.62 0.14 220 / 0.07), transparent 55%)";

export default function HomePage() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}

function HomeContent() {
  const { user, rol } = useAuth();
  const items = visibleNavItems(rol).filter((i) => i.href !== "/");
  const pos = items.find((i) => i.href === "/pos");
  const rest = items.filter((i) => i.href !== "/pos");

  return (
    <main className="relative min-h-screen overflow-hidden bg-muted/20 px-5 py-7 sm:px-8 sm:py-10">
      {/* Capa atmosférica */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: MESH_BACKGROUND }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.62 0.14 220 / 0.06) 1px, transparent 1px)," +
            "linear-gradient(90deg, oklch(0.62 0.14 220 / 0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8">
        <BrandHeader nombre={user?.nombre} />

        <DashboardStats rol={rol} />

        {/* CTA hero — Punto de Venta */}
        {pos && (
          <Link
            href={pos.href}
            className="grad-brand shadow-brand group relative flex items-center gap-5 overflow-hidden rounded-3xl px-6 py-7 text-white transition-transform duration-300 ease-out hover:-translate-y-1 sm:px-8 sm:py-9 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3"
          >
            <div
              aria-hidden
              className="grad-money absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-60"
            />
            <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm sm:h-20 sm:w-20">
              <ShoppingCart className="h-8 w-8 sm:h-10 sm:w-10" />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Vender ahora
              </p>
              <h2 className="mt-1 text-3xl font-bold leading-[0.95] tracking-tight sm:text-5xl">
                Punto de Venta
              </h2>
              <p className="mt-1 text-sm text-white/80 sm:text-base">
                {SUBTITLES["/pos"]}
              </p>
            </div>
            <ArrowRight className="relative h-7 w-7 shrink-0 translate-x-0 text-white/80 transition-transform duration-300 group-hover:translate-x-1.5 sm:h-9 sm:w-9" />
          </Link>
        )}

        {/* Accesos secundarios */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((item, i) => {
            const Icon = ICONS[item.href] ?? ShoppingCart;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ animationDelay: `${80 + i * 70}ms` }}
                className="card-premium group relative flex items-start gap-4 rounded-2xl p-5 hover:-translate-y-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground">{item.label}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {SUBTITLES[item.href] ?? ""}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground/70">
          Demo · Punto de venta
        </p>
      </div>
    </main>
  );
}

function BrandHeader({ nombre }: { nombre?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hora = now
    ? now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const fecha = now
    ? now.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";
  const saludo = getSaludo(now);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <span className="grad-brand shadow-brand flex h-12 w-12 items-center justify-center rounded-2xl text-white">
          <Store className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold leading-none text-foreground sm:text-2xl">
            Demo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {saludo}
            {nombre ? `, ${nombre}` : ""}
          </p>
        </div>
      </div>

      <div className="card-premium rounded-2xl px-4 py-2 text-right">
        <p className="font-mono text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
          {hora}
        </p>
        <p className="mt-1 text-xs capitalize text-muted-foreground">{fecha}</p>
      </div>
    </header>
  );
}

function getSaludo(now: Date | null): string {
  if (!now) return "Bienvenido";
  const h = now.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function DashboardStats({ rol }: { rol: UserRol | null }) {
  const showStock = !rol || rol === "admin";
  const [loading, setLoading] = useState(true);
  const [ventasHoy, setVentasHoy] = useState(0);
  const [cantHoy, setCantHoy] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [stockBajo, setStockBajo] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hasta = new Date();
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);
      const tasks: Promise<unknown>[] = [
        getReporte(desde, hasta)
          .then((r) => {
            if (!alive) return;
            setVentasHoy(r.resumen.totalVentas);
            setCantHoy(r.resumen.cantidad);
          })
          .catch(() => {}),
        getCajaAbierta()
          .then((c) => alive && setCaja(c))
          .catch(() => {}),
      ];
      if (showStock) {
        tasks.push(
          getProductsPage({ soloStockBajo: true, pageSize: 1 })
            .then((r) => alive && setStockBajo(r.total))
            .catch(() => {}),
        );
      }
      await Promise.allSettled(tasks);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [showStock]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: showStock ? 3 : 2 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* Ventas de hoy — protagonista */}
      <div className="card-premium relative overflow-hidden rounded-2xl p-5">
        <div
          aria-hidden
          className="grad-money pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-[0.18] blur-2xl"
        />
        <div className="eyebrow flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-money" /> Ventas de hoy
        </div>
        <p className="cifra-hero text-money mt-2 text-4xl sm:text-[2.75rem]">{formatCurrency(ventasHoy)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {cantHoy} {cantHoy === 1 ? "venta" : "ventas"}
        </p>
      </div>

      {/* Caja */}
      <Link
        href="/caja"
        className="card-premium group rounded-2xl p-5 hover:-translate-y-0.5"
      >
        <div className="eyebrow flex items-center gap-1.5">
          <Wallet className="h-4 w-4 text-primary" /> Caja
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${caja ? "bg-success animate-pulse-soft" : "bg-muted-foreground/40"}`}
          />
          <span className="text-xl font-bold">{caja ? "Abierta" : "Cerrada"}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {caja ? `desde ${formatTime(caja.openedAt)}` : "Tocá para abrir"}
        </p>
      </Link>

      {/* Stock bajo (solo admin) */}
      {showStock && (
        <Link
          href="/stock"
          className="card-premium group rounded-2xl p-5 hover:-translate-y-0.5"
        >
          <div className="eyebrow flex items-center gap-1.5">
            <AlertTriangle className={`h-4 w-4 ${stockBajo && stockBajo > 0 ? "text-warning" : "text-primary"}`} />
            Stock bajo
          </div>
          <p
            className={`cifra-hero mt-2 text-4xl sm:text-[2.75rem] ${stockBajo && stockBajo > 0 ? "text-warning" : "text-foreground"}`}
          >
            {stockBajo ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stockBajo && stockBajo > 0 ? "productos para reponer" : "todo en orden"}
          </p>
        </Link>
      )}
    </div>
  );
}
