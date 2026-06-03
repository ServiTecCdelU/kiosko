"use client";

import Link from "next/link";
import { RefreshCw, ShoppingCart, Wallet, Package, BarChart3 } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/hooks/use-auth";
import { visibleNavItems } from "@/lib/nav";

const ICONS: Record<string, typeof ShoppingCart> = {
  "/pos": ShoppingCart,
  "/caja": Wallet,
  "/stock": Package,
  "/reportes": BarChart3,
  "/sincronizacion": RefreshCw,
};

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">Kiosko Despensa</h1>
        {user && <p className="mt-1 text-muted-foreground">Hola, {user.nombre}</p>}
      </div>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = ICONS[item.href] ?? ShoppingCart;
          const primary = item.href === "/pos";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                primary
                  ? "flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                  : "flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border bg-card shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              }
            >
              <Icon className="h-8 w-8" />
              <span className="text-sm font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
