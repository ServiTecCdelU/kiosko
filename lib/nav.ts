// lib/nav.ts — items de navegacion del kiosko
import type { LucideIcon } from "lucide-react";
import { Home, ShoppingCart, Wallet, Package, BarChart3, RefreshCw } from "lucide-react";
import type { UserRol } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: Home },
  { label: "Punto de Venta", href: "/pos", icon: ShoppingCart },
  { label: "Caja", href: "/caja", icon: Wallet },
  { label: "Stock", href: "/stock", icon: Package, adminOnly: true },
  { label: "Reportes", href: "/reportes", icon: BarChart3, adminOnly: true },
  { label: "Sincronizacion", href: "/sincronizacion", icon: RefreshCw, adminOnly: true },
];

export function visibleNavItems(rol: UserRol | null): NavItem[] {
  // Sin sesion (rol null) se muestran todos los items.
  if (!rol || rol === "admin") return NAV_ITEMS;
  return NAV_ITEMS.filter((i) => !i.adminOnly);
}
