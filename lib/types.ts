// lib/types.ts — tipos del Kiosko Despensa

export type OfertaTipo = "monto" | "porcentaje" | "combo";

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
  lote?: number;
  revisar: boolean;
  favorito: boolean;
  fechaVencimiento?: Date;
  unidad: "un" | "kg";
  stockControlado: boolean;
  disabled: boolean;
  // Oferta de catálogo (descuento propio del kiosko, la sync no lo toca)
  ofertaActiva: boolean;
  ofertaTipo?: OfertaTipo;
  ofertaValor: number;
  ofertaCantidad?: number;
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

// "tarjeta" ya no se ofrece en el POS: era para cobrar con un posnet de banco
// sin integracion (el cajero cobraba aparte y lo marcaba a mano). Con el lector
// Point andando se saco, porque elegirlo por error registraba la venta sin
// cobrar nada. Se mantiene el valor para que las ventas viejas sigan leyendose.
export type PaymentMethod = "efectivo" | "transferencia" | "mixto" | "fiado" | "mercadopago" | "tarjeta" | "mercadopago_point" | "debito" | "credito";
export type VentaEstado = "completada" | "anulada";

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
  clienteId?: string;
  userId?: string;
  userName?: string;
  /** Nombre y apellido de quien pago, para Transferencia/Debito/Credito/Mixto. */
  pagadorNombre?: string;
  cuotas?: number;
  recargoPct?: number;
  estado: VentaEstado;
  anuladaAt?: Date;
  anuladaPorNombre?: string;
  motivoAnulacion?: string;
  createdAt: Date;
}

export type CajaMovTipo = "retiro" | "aporte" | "gasto";

export interface CajaMovimiento {
  id: string;
  cajaId: string;
  tipo: CajaMovTipo;
  monto: number;
  concepto: string;
  usuarioNombre?: string;
  fecha: Date;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  documento?: string;
  limiteCredito: number;
  saldo: number; // deuda actual (positivo = debe)
  notas?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CuentaMovTipo = "cargo" | "pago" | "ajuste";

export interface CuentaMov {
  id: string;
  clienteId: string;
  tipo: CuentaMovTipo;
  monto: number;
  saldoAnterior?: number;
  saldoNuevo?: number;
  ventaId?: string;
  referencia?: string;
  usuario?: string;
  fecha: Date;
}

export interface Caja {
  id: string;
  estado: "abierta" | "cerrada";
  montoApertura: number;
  montoCierre?: number;
  totalEfectivo: number;
  totalTransferencia: number;
  /** Cobros por Mercado Pago (QR y Point). 0 en cajas cerradas antes del desglose. */
  totalMercadoPago: number;
  totalVentas: number;
  cantidadVentas: number;
  totalRetiros: number;
  totalAportes: number;
  totalGastos: number;
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
  comercioId: string;
  activo: boolean;
  createdAt: Date;
}
