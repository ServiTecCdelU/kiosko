// lib/nav.ts — items de navegacion del kiosko
import type { LucideIcon } from "lucide-react";
import { Home, ShoppingCart, Wallet, Users, Package, BarChart3, RefreshCw, Receipt, UserCog, Truck, Megaphone, FileText, CircleHelp, CircleDollarSign, ClipboardList, ChefHat } from "lucide-react";
import type { UserRol } from "@/lib/types";
import { panelHref } from "@/lib/panel";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles no-admin que tambien ven el item. Sin definir = solo admin. */
  roles?: UserRol[];
  /**
   * Rubros del alta (lib/registro.ts) que ven el item en el menu. Sin definir = todos.
   * Solo ordena el menu: la pantalla se puede abrir igual (la guardia es por rol).
   */
  rubros?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: Home },
  { label: "Punto de Venta", href: "/pos", icon: ShoppingCart, roles: ["encargado", "cajero"] },
  // El cajero abre y cierra su propia caja (la pantalla adapta lo que muestra por rol).
  { label: "Caja", href: "/caja", icon: Wallet, roles: ["encargado", "cajero"] },
  { label: "Ventas", href: "/ventas", icon: Receipt, roles: ["encargado"] },
  // Presupuestos del mostrador: los arma y los pasa a venta cualquiera que atienda.
  { label: "Presupuestos", href: "/presupuestos", icon: ClipboardList, roles: ["encargado", "cajero"] },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Stock", href: "/stock", icon: Package },
  // Produccion del dia: para quien elabora (pan, facturas, milanesas...).
  {
    label: "Producción", href: "/produccion", icon: ChefHat, roles: ["encargado"],
    rubros: ["panaderia", "carniceria", "almacen", "supermercado", "dietetica", "otro"],
  },
  { label: "Promociones", href: "/promociones", icon: Megaphone, roles: ["encargado"] },
  { label: "Compras", href: "/compras", icon: Truck },
  { label: "Empleados", href: "/usuarios", icon: UserCog },
  { label: "Reportes", href: "/reportes", icon: BarChart3 },
  { label: "Facturación", href: "/facturacion", icon: FileText },
  { label: "Catálogo y copia de datos", href: "/sincronizacion", icon: RefreshCw },
  { label: "Ayuda", href: "/ayuda", icon: CircleHelp, roles: ["encargado", "cajero"] },
  // Solo el dueño: plan, pagos y debito automatico (app/suscripcion).
  { label: "Suscripción", href: "/suscripcion", icon: CircleDollarSign },
];

/** href real del item: "Inicio" apunta al panel del comercio (/<slug>). */
export function hrefDe(item: NavItem, comercioSlug: string | undefined): string {
  return item.href === "/" ? panelHref(comercioSlug) : item.href;
}

/** Items visibles segun rol: admin ve todo; encargado y cajero, lo declarado en roles. */
export function visibleNavItems(rol: UserRol | null, rubro?: string): NavItem[] {
  // Comercios sin rubro (anteriores al alta self-service) ven todo.
  const porRubro = NAV_ITEMS.filter((i) => !i.rubros || !rubro || i.rubros.includes(rubro));
  // Sin sesion (rol null) se muestran todos los items.
  if (!rol || rol === "admin") return porRubro;
  return porRubro.filter((i) => i.roles?.includes(rol));
}
