// lib/nav.ts — items de navegacion del kiosko
import type { LucideIcon } from "lucide-react";
import { Home, ShoppingCart, Wallet, Users, Package, BarChart3, RefreshCw, Receipt, UserCog, Truck, Megaphone } from "lucide-react";
import type { UserRol } from "@/lib/types";
import { panelHref } from "@/lib/panel";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles no-admin que tambien ven el item. Sin definir = solo admin. */
  roles?: UserRol[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: Home },
  { label: "Punto de Venta", href: "/pos", icon: ShoppingCart, roles: ["encargado", "cajero"] },
  // El cajero abre y cierra su propia caja (la pantalla adapta lo que muestra por rol).
  { label: "Caja", href: "/caja", icon: Wallet, roles: ["encargado", "cajero"] },
  { label: "Ventas", href: "/ventas", icon: Receipt, roles: ["encargado"] },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Stock", href: "/stock", icon: Package },
  { label: "Promociones", href: "/promociones", icon: Megaphone, roles: ["encargado"] },
  { label: "Compras", href: "/compras", icon: Truck },
  { label: "Empleados", href: "/usuarios", icon: UserCog },
  { label: "Reportes", href: "/reportes", icon: BarChart3 },
  { label: "Sincronizacion", href: "/sincronizacion", icon: RefreshCw },
];

/** href real del item: "Inicio" apunta al panel del comercio (/<slug>). */
export function hrefDe(item: NavItem, comercioSlug: string | undefined): string {
  return item.href === "/" ? panelHref(comercioSlug) : item.href;
}

/** Items visibles segun rol: admin ve todo; encargado y cajero, lo declarado en roles. */
export function visibleNavItems(rol: UserRol | null): NavItem[] {
  // Sin sesion (rol null) se muestran todos los items.
  if (!rol || rol === "admin") return NAV_ITEMS;
  return NAV_ITEMS.filter((i) => i.roles?.includes(rol));
}
