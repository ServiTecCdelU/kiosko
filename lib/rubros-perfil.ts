// lib/rubros-perfil.ts — lo que cambia segun el rubro elegido en el alta (lib/registro.ts).
// Puro: lo usan la pantalla de Stock y los tests.
// Diseño: docs/superpowers/specs/2026-10-18-perfil-por-rubro-design.md
import type { Unidad } from "./unidades.ts";

export interface ProductoTipico {
  name: string;
  category: string;
  unidad: Unidad;
  /** false: se vende sin contar (pan, verdura suelta, servicios). */
  stockControlado: boolean;
  /** true: al venderlo se tipea el importe (recargas, varios): no pide precio. */
  precioLibre?: boolean;
  /** Codigo fijo (solo "Varios": el boton del POS lo busca por VARIOS). */
  codigo?: string;
}

export interface PerfilRubro {
  /** Unidad con la que arranca "Producto nuevo". */
  unidad: Unidad;
  /** Si "Producto nuevo" arranca controlando stock (lo suelto de panaderia o verduleria no se cuenta). */
  controlaStock: boolean;
  /** Rubros/subrubros habituales para el campo "Rubro / Subrubro". */
  categorias: string[];
  tipicos: ProductoTipico[];
}

const VARIOS: ProductoTipico = {
  name: "Varios", category: "Varios", unidad: "un", stockControlado: false, precioLibre: true, codigo: "VARIOS",
};

const suelto = (name: string, category: string, unidad: Unidad = "kg"): ProductoTipico =>
  ({ name, category, unidad, stockControlado: false });
const contado = (name: string, category: string, unidad: Unidad = "un"): ProductoTipico =>
  ({ name, category, unidad, stockControlado: true });

export const PERFILES: Record<string, PerfilRubro> = {
  panaderia: {
    unidad: "kg",
    controlaStock: false,
    categorias: ["Panadería / Pan", "Panadería / Facturas", "Confitería", "Sandwichería", "Bebidas", "Almacén"],
    tipicos: [
      suelto("Pan francés", "Panadería / Pan"),
      suelto("Pan flauta", "Panadería / Pan"),
      suelto("Bizcochitos de grasa", "Panadería / Pan"),
      suelto("Facturas", "Panadería / Facturas", "un"),
      suelto("Medialunas", "Panadería / Facturas", "un"),
      suelto("Sándwich de miga", "Sandwichería", "un"),
      contado("Pan de molde", "Panadería / Pan"),
      contado("Prepizza", "Panadería / Pan"),
      VARIOS,
    ],
  },
  verduleria: {
    unidad: "kg",
    controlaStock: false,
    categorias: ["Verduras", "Frutas", "Hierbas", "Huevos", "Almacén"],
    tipicos: [
      suelto("Papa", "Verduras"),
      suelto("Cebolla", "Verduras"),
      suelto("Tomate", "Verduras"),
      suelto("Zanahoria", "Verduras"),
      suelto("Zapallo", "Verduras"),
      suelto("Lechuga", "Verduras"),
      suelto("Banana", "Frutas"),
      suelto("Manzana", "Frutas"),
      suelto("Naranja", "Frutas"),
      contado("Huevos (maple x30)", "Huevos"),
      VARIOS,
    ],
  },
  carniceria: {
    unidad: "kg",
    controlaStock: false,
    categorias: ["Vaca", "Cerdo", "Pollo", "Achuras", "Embutidos", "Elaborados"],
    tipicos: [
      suelto("Asado", "Vaca"),
      suelto("Vacío", "Vaca"),
      suelto("Matambre", "Vaca"),
      suelto("Nalga", "Vaca"),
      suelto("Carne picada común", "Vaca"),
      suelto("Carne picada especial", "Vaca"),
      suelto("Pollo entero", "Pollo"),
      suelto("Pechuga", "Pollo"),
      suelto("Chorizo", "Embutidos"),
      suelto("Milanesas de carne", "Elaborados"),
      VARIOS,
    ],
  },
  dietetica: {
    unidad: "kg",
    controlaStock: true,
    categorias: ["Frutos secos", "Cereales", "Semillas", "Harinas", "Legumbres", "Especias", "Suplementos"],
    tipicos: [
      contado("Almendras", "Frutos secos", "kg"),
      contado("Nueces", "Frutos secos", "kg"),
      contado("Pasas de uva", "Frutos secos", "kg"),
      contado("Mix de frutos secos", "Frutos secos", "kg"),
      contado("Avena arrollada", "Cereales", "kg"),
      contado("Granola", "Cereales", "kg"),
      contado("Semillas de chía", "Semillas", "kg"),
      contado("Harina integral", "Harinas", "kg"),
      VARIOS,
    ],
  },
  kiosco: {
    unidad: "un",
    controlaStock: true,
    categorias: ["Golosinas", "Bebidas", "Cigarrillos", "Galletitas", "Snacks", "Recargas"],
    tipicos: [
      { name: "Recarga SUBE", category: "Recargas", unidad: "un", stockControlado: false, precioLibre: true },
      { name: "Recarga de celular", category: "Recargas", unidad: "un", stockControlado: false, precioLibre: true },
      VARIOS,
    ],
  },
  almacen: {
    unidad: "un",
    controlaStock: true,
    categorias: ["Almacén", "Bebidas", "Lácteos", "Fiambrería", "Limpieza", "Perfumería", "Panadería"],
    tipicos: [
      suelto("Pan", "Panadería"),
      suelto("Queso cremoso", "Fiambrería"),
      suelto("Jamón cocido", "Fiambrería"),
      contado("Huevos (maple x30)", "Almacén"),
      VARIOS,
    ],
  },
  supermercado: {
    unidad: "un",
    controlaStock: true,
    categorias: ["Almacén", "Bebidas", "Lácteos", "Fiambrería", "Carnicería", "Verdulería", "Limpieza", "Perfumería"],
    tipicos: [
      suelto("Pan", "Panadería"),
      suelto("Queso cremoso", "Fiambrería"),
      suelto("Papa", "Verdulería"),
      suelto("Carne picada", "Carnicería"),
      VARIOS,
    ],
  },
  ferreteria: {
    unidad: "un",
    controlaStock: true,
    categorias: ["Electricidad", "Plomería", "Tornillería", "Herramientas", "Pinturería", "Jardín", "Construcción"],
    tipicos: [
      contado("Cable unipolar 2,5 mm", "Electricidad", "m"),
      contado("Cable unipolar 1,5 mm", "Electricidad", "m"),
      contado("Manguera de jardín 1/2\"", "Jardín", "m"),
      contado("Cadena", "Construcción", "m"),
      contado("Caño termofusión 20 mm", "Plomería", "m"),
      contado("Tornillo autoperforante", "Tornillería"),
      contado("Tarugo 8 mm", "Tornillería"),
      VARIOS,
    ],
  },
  libreria: {
    unidad: "un",
    controlaStock: true,
    categorias: ["Escolar", "Oficina", "Papelería", "Arte", "Servicios"],
    tipicos: [
      { name: "Fotocopia simple faz", category: "Servicios", unidad: "un", stockControlado: false },
      { name: "Fotocopia color", category: "Servicios", unidad: "un", stockControlado: false },
      { name: "Impresión", category: "Servicios", unidad: "un", stockControlado: false },
      { name: "Anillado", category: "Servicios", unidad: "un", stockControlado: false },
      contado("Cuaderno tapa dura", "Escolar"),
      contado("Resma A4", "Oficina"),
      VARIOS,
    ],
  },
  repuestos: {
    unidad: "un",
    controlaStock: true,
    categorias: ["Filtros", "Lubricantes", "Frenos", "Encendido", "Distribución", "Suspensión", "Iluminación", "Baterías", "Accesorios"],
    tipicos: [
      contado("Aceite suelto 15W40", "Lubricantes", "l"),
      contado("Aceite suelto 20W50", "Lubricantes", "l"),
      contado("Manguera de nafta 8 mm", "Accesorios", "m"),
      contado("Cable para batería", "Accesorios", "m"),
      { name: "Mano de obra", category: "Servicios", unidad: "un", stockControlado: false, precioLibre: true },
      VARIOS,
    ],
  },
  otro: { unidad: "un", controlaStock: true, categorias: [], tipicos: [VARIOS] },
};

export function perfilDeRubro(rubro: string | null | undefined): PerfilRubro {
  return (rubro && PERFILES[rubro]) || PERFILES.otro;
}

const normalizar = (s: string) => s.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Los tipicos que el comercio todavia no tiene (por nombre, sin mayusculas ni acentos). */
export function tipicosFaltantes(perfil: PerfilRubro, nombresExistentes: string[]): ProductoTipico[] {
  const ya = new Set(nombresExistentes.map(normalizar));
  return perfil.tipicos.filter((t) => !ya.has(normalizar(t.name)));
}
