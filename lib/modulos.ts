// lib/modulos.ts — pantallas y funciones que dependen del rubro del comercio.
//
// Cada rubro arranca con lo que suele usar (una verduleria no hornea, un kiosco no
// hace presupuestos). El dueño puede prender o apagar cada modulo en "Mi comercio":
// lo que elige se guarda en comercios.config.modulos y le gana al rubro.
// Solo ordena lo que se muestra: la pantalla se puede abrir igual por URL (la guardia
// es por rol y por plan).

export type ModuloId = "produccion" | "presupuestos" | "balanza";

export interface Modulo {
  id: ModuloId;
  nombre: string;
  descripcion: string;
  /** Rubros (lib/registro.ts) que lo tienen prendido de entrada. */
  rubros: string[];
}

export const MODULOS: Modulo[] = [
  {
    id: "produccion",
    nombre: "Producción",
    descripcion: "Lo que se elabora en el local (pan, facturas, milanesas): entra al stock y se descarta el sobrante.",
    rubros: ["panaderia", "carniceria", "almacen", "supermercado", "dietetica"],
  },
  {
    id: "presupuestos",
    nombre: "Presupuestos",
    descripcion: "Armar un presupuesto en PDF desde la caja y pasarlo a venta después.",
    rubros: ["ferreteria", "libreria", "almacen", "supermercado"],
  },
  {
    id: "balanza",
    nombre: "Balanza",
    descripcion: "Balanza conectada a la PC, etiquetas con código de balanza y precios a las Systel por Qendra.",
    rubros: ["verduleria", "carniceria", "panaderia", "dietetica", "almacen", "supermercado"],
  },
];

export type ModulosElegidos = Partial<Record<ModuloId, boolean>>;

export function esModuloId(v: unknown): v is ModuloId {
  return MODULOS.some((m) => m.id === v);
}

/** Lo que trae el rubro, sin lo que eligio el dueño. Sin rubro (o "otro"): todo prendido. */
export function moduloPorRubro(id: ModuloId, rubro: string | null | undefined): boolean {
  if (!rubro || rubro === "otro") return true;
  return MODULOS.find((m) => m.id === id)?.rubros.includes(rubro) ?? true;
}

/** ¿El comercio usa este modulo? Lo elegido por el dueño le gana al rubro. */
export function moduloActivo(id: ModuloId, rubro: string | null | undefined, elegidos?: ModulosElegidos | null): boolean {
  const elegido = elegidos?.[id];
  return typeof elegido === "boolean" ? elegido : moduloPorRubro(id, rubro);
}

/** Limpia lo que llega del navegador: solo modulos conocidos y booleanos. */
export function modulosValidos(v: unknown): ModulosElegidos {
  const out: ModulosElegidos = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (esModuloId(k) && typeof val === "boolean") out[k] = val;
  }
  return out;
}
