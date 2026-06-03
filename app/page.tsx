import Link from "next/link";
import { RefreshCw, ShoppingCart } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="rounded-2xl border bg-card px-8 py-10 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">Kiosko Despensa</h1>
        <p className="mt-2 text-muted-foreground">Sistema de punto de venta</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/pos"
          className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <ShoppingCart className="h-4 w-4" /> Punto de Venta
        </Link>
        <Link
          href="/sincronizacion"
          className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-3 font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <RefreshCw className="h-4 w-4" /> Sincronizacion
        </Link>
      </div>
    </main>
  );
}
