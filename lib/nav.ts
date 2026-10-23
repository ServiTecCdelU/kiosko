// lib/nav.ts — items de navegacion del kiosko
import type { LucideIcon } from "lucide-react";
import { Home, ShoppingCart, Wallet, Users, Package, BarChart3, RefreshCw, Receipt, UserCog, Truck, Megaphone, FileText, CircleHelp, CircleDollarSign, ClipboardList, ChefHat, Store, ShoppingBag, ArrowLeftRight } from "lucide-react";
import type { UserRol } from "@/lib/types";
import { moduloActivo, type ModuloId, type ModulosElegidos } from "@/lib/modulos";
import { planIncluyeTienda } from "@/lib/suscripcion";
import { panelHref } from "@/lib/panel";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles no-admin que tambien ven el item. Sin definir = solo admin. */
  roles?: UserRol[];
  /**
   * Modulo del que depende (lib/modulos.ts): sale segun el rubro y lo que elija el
   * dueño en "Mi comercio". Solo ordena el menu: la pantalla se abre igual por URL.
   */
  modulo?: ModuloId;
  /** Solo con un plan que incluye la tienda online (lib/suscripcion.ts). */
  requiereTienda?: boolean;
  /** Solo el comercio vinculado a la distribuidora (distribuidora_vinculo). */
  requiereDistribuidora?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: Home },
  { label: "Punto de Venta", href: "/pos", icon: ShoppingCart, roles: ["encargado", "cajero"] },
  // El cajero abre y cierra su propia caja (la pantalla adapta lo que muestra por rol).
  { label: "Caja", href: "/caja", icon: Wallet, roles: ["encargado", "cajero"] },
  { label: "Ventas", href: "/ventas", icon: Receipt, roles: ["encargado"] },
  // Presupuestos del mostrador: los arma y los pasa a venta cualquiera que atienda.
  // Pedidos de la tienda online (plan Tienda): los atiende cualquiera que este en el mostrador.
  { label: "Pedidos", href: "/pedidos", icon: ShoppingBag, roles: ["encargado", "cajero"], requiereTienda: true },
  { label: "Presupuestos", href: "/presupuestos", icon: ClipboardList, roles: ["encargado", "cajero"], modulo: "presupuestos" },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Stock", href: "/stock", icon: Package },
  // Stock compartido con la distribuidora: mover de un lado al otro (solo el comercio vinculado).
  { label: "Distribuidora", href: "/distribuidora", icon: ArrowLeftRight, roles: ["encargado"], requiereDistribuidora: true },
  // Produccion del dia: para quien elabora (pan, facturas, milanesas...).
  { label: "Producción", href: "/produccion", icon: ChefHat, roles: ["encargado"], modulo: "produccion" },
  { label: "Promociones", href: "/promociones", icon: Megaphone, roles: ["encargado"] },
  { label: "Compras", href: "/compras", icon: Truck },
  { label: "Empleados", href: "/usuarios", icon: UserCog },
  { label: "Reportes", href: "/reportes", icon: BarChart3 },
  { label: "Facturación", href: "/facturacion", icon: FileText },
  { label: "Catálogo y copia de datos", href: "/sincronizacion", icon: RefreshCw },
  // Solo el dueño: rubro y pantallas del menu (lib/modulos.ts).
  { label: "Mi comercio", href: "/mi-comercio", icon: Store },
  { label: "Ayuda", href: "/ayuda", icon: CircleHelp, roles: ["encargado", "cajero"] },
  // Solo el dueño: plan, pagos y debito automatico (app/suscripcion).
  { label: "Suscripción", href: "/suscripcion", icon: CircleDollarSign },
];

/** href real del item: "Inicio" apunta al panel del comercio (/<slug>). */
export function hrefDe(item: NavItem, comercioSlug: string | undefined): string {
  return item.href === "/" ? panelHref(comercioSlug) : item.href;
}

/** Items visibles segun rol y modulos: admin ve todo; encargado y cajero, lo declarado en roles. */
export function visibleNavItems(rol: UserRol | null, rubro?: string, modulos?: ModulosElegidos, plan?: string, conDistribuidora = false): NavItem[] {
  // Comercios sin rubro (anteriores al alta self-service) ven todo, salvo lo que apague el dueño.
  const porRubro = NAV_ITEMS.filter((i) =>
    (!i.modulo || moduloActivo(i.modulo, rubro, modulos)) && (!i.requiereTienda || planIncluyeTienda(plan)) && (!i.requiereDistribuidora || conDistribuidora),
  );
  // Sin sesion (rol null) se muestran todos los items.
  if (!rol || rol === "admin") return porRubro;
  return porRubro.filter((i) => i.roles?.includes(rol));
}
