"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Store, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleNavItems } from "@/lib/nav";
import { useAuth, AUTH_DISABLED } from "@/hooks/use-auth";
import { AuthGuard } from "@/components/auth/auth-guard";

interface AppShellProps {
  title?: string;
  children: React.ReactNode;
}

const COLLAPSE_KEY = "kiosko_nav_colapsado";

export function AppShell({ title, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, rol, logout } = useAuth();
  const items = visibleNavItems(rol);
  const [colapsado, setColapsado] = useState(false);

  useEffect(() => {
    setColapsado(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleColapsado = () => {
    setColapsado((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <AuthGuard>
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          colapsado ? "w-[68px]" : "w-60",
        )}
      >
        <div className={cn("flex items-center gap-3 px-5 py-5", colapsado && "justify-center px-0")}>
          <span className="grad-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-md shadow-black/30">
            <Store className="h-5 w-5" />
          </span>
          {!colapsado && <span className="text-base font-bold tracking-tight">Demo</span>}
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={colapsado ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  colapsado && "justify-center px-0",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-sidebar-primary/40"
                    : "text-sidebar-foreground/75 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0 transition-transform", active && "scale-110")} />
                {!colapsado && item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={toggleColapsado}
          className={cn(
            "mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            colapsado && "justify-center px-0",
          )}
          aria-label={colapsado ? "Mostrar menú" : "Ocultar menú"}
        >
          {colapsado ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
          {!colapsado && "Ocultar menú"}
        </button>

        {user && (
          <div className="border-t border-sidebar-border px-3 py-3">
            <div className={cn("flex items-center justify-between gap-2 px-2", colapsado && "justify-center px-0")}>
              {!colapsado && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.nombre}</p>
                  <p className="text-xs capitalize text-sidebar-foreground/60">{user.rol}</p>
                </div>
              )}
              {!AUTH_DISABLED && (
                <button onClick={handleLogout} className="text-sidebar-foreground/70 hover:text-sidebar-foreground" aria-label="Salir">
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Top nav mobile */}
      <header className="sticky top-0 z-20 flex items-center gap-2 overflow-x-auto border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground lg:hidden">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
        {user && !AUTH_DISABLED && (
          <button onClick={handleLogout} className="ml-auto shrink-0 px-2 text-sidebar-foreground/70" aria-label="Salir">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </header>

      <main className="bg-mesh flex-1 overflow-y-auto bg-muted/20">
        {title && (
          <div className="glass sticky top-0 z-10 border-b border-border/60 px-4 py-3.5 sm:px-6">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
    </AuthGuard>
  );
}
