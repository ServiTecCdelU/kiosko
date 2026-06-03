// lib/types.ts — tipos del Kiosko Despensa

export interface Product {
  id: string;
  codigo?: string;
  codigoBarras?: string;
  name: string;
  description: string;
  price: number;
  precioBase?: number;
  category: string;
  imageUrl: string;
  stock: number;
  stockMinimo: number;
  disabled: boolean;
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export type PaymentMethod = "efectivo" | "transferencia" | "mixto";

export interface Sale {
  id: string;
  saleNumber?: string;
  items: SaleItem[];
  total: number;
  discount: number;
  paymentMethod: PaymentMethod;
  cashAmount: number;
  changeAmount: number;
  transferAmount: number;
  cajaId?: string;
  userId?: string;
  userName?: string;
  createdAt: Date;
}

export interface Caja {
  id: string;
  estado: "abierta" | "cerrada";
  montoApertura: number;
  montoCierre?: number;
  totalEfectivo: number;
  totalTransferencia: number;
  totalVentas: number;
  cantidadVentas: number;
  diferencia?: number;
  abiertaPor?: string;
  abiertaPorNombre?: string;
  cerradaPor?: string;
  notas?: string;
  openedAt: Date;
  closedAt?: Date;
}

export type StockMovTipo = "venta" | "entrada" | "ajuste" | "sync" | "rotura";

export interface StockMovimiento {
  id: string;
  productoId: string;
  tipo: StockMovTipo;
  cantidad: number;
  stockAnterior?: number;
  stockNuevo?: number;
  referencia?: string;
  usuario?: string;
  fecha: Date;
}

export type SyncEstado = "ok" | "error" | "parcial";

export interface SyncLog {
  id: number;
  estado: SyncEstado;
  productosCreados: number;
  productosActualizados: number;
  productosTotal: number;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
}

export type UserRol = "admin" | "cajero";

export interface Usuario {
  id: string;
  nombre: string;
  rol: UserRol;
  activo: boolean;
  createdAt: Date;
}
