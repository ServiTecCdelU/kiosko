// lib/backup-hojas.ts — que va en el backup de un comercio y como se ve.
//
// Una hoja por tema, con titulos en castellano y valores legibles (fechas en
// horario argentino, Si/No, numeros como numeros para poder sumar en Excel).
// Solo se exportan las columnas declaradas aca: un campo nuevo o secreto
// (pin_hash, mp_token_cifrado...) nunca se cuela solo.
//
// Funciones puras: lib/server/backup.ts lee la base y arma el archivo.
// Testeado en backup-hojas.test.ts.

export type TipoColumna = "texto" | "numero" | "fecha" | "dia" | "bool";

export interface Columna {
  campo: string;
  titulo: string;
  tipo?: TipoColumna;
}

export interface Hoja {
  nombre: string;
  tabla: string;
  /** Columna por la que se ordena (ascendente) */
  orden: string;
  columnas: Columna[];
}

/** Excel no admite mas de 32767 caracteres por celda. */
export const MAX_TEXTO_CELDA = 32_000;

const ZONA = "America/Argentina/Buenos_Aires";
const fmtFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

const c = (campo: string, titulo: string, tipo: TipoColumna = "texto"): Columna => ({ campo, titulo, tipo });

export const HOJAS: Hoja[] = [
  {
    nombre: "Productos", tabla: "productos", orden: "name",
    columnas: [
      c("codigo", "Código"), c("codigo_barras", "Código de barras"), c("name", "Nombre"), c("category", "Rubro"),
      c("price", "Precio", "numero"), c("precio_base", "Costo", "numero"), c("stock", "Stock", "numero"),
      c("stock_minimo", "Stock mínimo", "numero"), c("unidad", "Unidad"), c("lote", "Unidades por bulto", "numero"),
      c("stock_controlado", "Controla stock", "bool"), c("iva", "IVA %", "numero"), c("fecha_vencimiento", "Vencimiento", "dia"),
      c("favorito", "Favorito", "bool"), c("oferta_activa", "Oferta activa", "bool"), c("oferta_tipo", "Tipo de oferta"),
      c("oferta_valor", "Valor de oferta", "numero"), c("oferta_cantidad", "Cantidad de oferta", "numero"),
      c("oferta_desde", "Oferta desde", "dia"), c("oferta_hasta", "Oferta hasta", "dia"),
      c("disabled", "Dado de baja", "bool"), c("description", "Descripción"), c("created_at", "Creado", "fecha"),
      c("id", "ID"),
    ],
  },
  {
    nombre: "Clientes", tabla: "clientes", orden: "nombre",
    columnas: [
      c("nombre", "Nombre"), c("telefono", "Teléfono"), c("documento", "Documento"), c("condicion_iva", "Condición IVA"),
      c("saldo", "Saldo (deuda)", "numero"), c("limite_credito", "Límite de crédito", "numero"),
      c("puntos", "Puntos", "numero"), c("activo", "Activo", "bool"), c("notas", "Notas"),
      c("created_at", "Alta", "fecha"), c("id", "ID"),
    ],
  },
  {
    nombre: "Ventas", tabla: "ventas", orden: "created_at",
    columnas: [
      c("sale_number", "N°"), c("created_at", "Fecha", "fecha"), c("estado", "Estado"),
      c("total", "Total", "numero"), c("discount", "Descuento", "numero"), c("payment_method", "Método de pago"),
      c("cash_amount", "Efectivo", "numero"), c("change_amount", "Vuelto", "numero"),
      c("transfer_amount", "Transferencia / MP", "numero"), c("cuotas", "Cuotas", "numero"),
      c("recargo_pct", "Recargo %", "numero"), c("pagador_nombre", "Pagó"), c("user_name", "Cajero"),
      c("cliente_id", "ID cliente"), c("caja_id", "ID caja"), c("payment_ref", "Referencia de pago"),
      c("anulada_at", "Anulada el", "fecha"), c("anulada_por_nombre", "Anulada por"),
      c("motivo_anulacion", "Motivo de anulación"), c("id", "ID"),
    ],
  },
  {
    nombre: "Caja", tabla: "caja", orden: "opened_at",
    columnas: [
      c("opened_at", "Apertura", "fecha"), c("closed_at", "Cierre", "fecha"), c("estado", "Estado"),
      c("abierta_por_nombre", "Abrió"), c("monto_apertura", "Fondo inicial", "numero"),
      c("total_ventas", "Total ventas", "numero"), c("cantidad_ventas", "Cantidad de ventas", "numero"),
      c("total_efectivo", "Efectivo", "numero"), c("total_transferencia", "Transferencia", "numero"),
      c("total_mercadopago", "Mercado Pago", "numero"), c("total_retiros", "Retiros", "numero"),
      c("total_aportes", "Aportes", "numero"), c("total_gastos", "Gastos", "numero"),
      c("monto_cierre", "Contado al cierre", "numero"), c("diferencia", "Diferencia", "numero"),
      c("notas", "Notas"), c("puesto_id", "ID puesto"), c("id", "ID"),
    ],
  },
  {
    nombre: "Movimientos de caja", tabla: "caja_movimientos", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("tipo", "Tipo"), c("monto", "Monto", "numero"), c("concepto", "Concepto"),
      c("categoria", "Categoría"), c("usuario_nombre", "Usuario"), c("caja_id", "ID caja"), c("id", "ID"),
    ],
  },
  {
    nombre: "Cuenta corriente", tabla: "cuenta_corriente_mov", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("cliente_id", "ID cliente"), c("tipo", "Tipo"), c("monto", "Monto", "numero"),
      c("saldo_anterior", "Saldo anterior", "numero"), c("saldo_nuevo", "Saldo nuevo", "numero"),
      c("referencia", "Referencia"), c("usuario", "Usuario"), c("venta_id", "ID venta"), c("id", "ID"),
    ],
  },
  {
    nombre: "Proveedores", tabla: "proveedores", orden: "nombre",
    columnas: [
      c("nombre", "Nombre"), c("telefono", "Teléfono"), c("activo", "Activo", "bool"), c("notas", "Notas"),
      c("created_at", "Alta", "fecha"), c("id", "ID"),
    ],
  },
  {
    nombre: "Compras", tabla: "compras", orden: "created_at",
    columnas: [
      c("created_at", "Fecha", "fecha"), c("proveedor_id", "ID proveedor"), c("remito", "Remito"),
      c("condicion", "Condición"), c("pagada", "Pagada", "bool"), c("total", "Total", "numero"),
      c("pagado", "Pagado", "numero"), c("vence", "Vence", "dia"),
      c("estado", "Estado"), c("usuario_nombre", "Cargó"), c("notas", "Notas"),
      c("anulada_at", "Anulada el", "fecha"), c("id", "ID"),
    ],
  },
  {
    nombre: "Detalle de compras", tabla: "compra_items", orden: "id",
    columnas: [
      c("compra_id", "ID compra"), c("producto_nombre", "Producto"), c("cantidad", "Cantidad", "numero"),
      c("costo_unitario", "Costo unitario", "numero"), c("subtotal", "Subtotal", "numero"), c("producto_id", "ID producto"),
    ],
  },
  {
    nombre: "Pagos a proveedores", tabla: "proveedor_pagos", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("proveedor_id", "ID proveedor"), c("monto", "Monto", "numero"), c("metodo", "Forma de pago"),
      c("nota", "Nota"), c("usuario_nombre", "Registró"), c("anulado_at", "Anulado el", "fecha"), c("caja_id", "ID caja"), c("id", "ID"),
    ],
  },
  {
    nombre: "Lotes de vencimiento", tabla: "producto_lotes", orden: "fecha_vencimiento",
    columnas: [
      c("producto_id", "ID producto"), c("fecha_vencimiento", "Vence", "dia"), c("cantidad", "Cantidad", "numero"),
      c("activo", "Activo", "bool"), c("compra_id", "ID compra"), c("nota", "Nota"), c("created_at", "Cargado", "fecha"), c("id", "ID"),
    ],
  },
  {
    nombre: "Recuentos de stock", tabla: "inventarios", orden: "created_at",
    columnas: [
      c("created_at", "Abierto", "fecha"), c("cerrado_at", "Cerrado", "fecha"), c("estado", "Estado"), c("nombre", "Nombre"),
      c("categoria", "Rubro"), c("productos", "Productos", "numero"), c("contados", "Contados", "numero"),
      c("con_diferencia", "Con diferencia", "numero"), c("diferencia_valor", "Diferencia a costo", "numero"),
      c("usuario_nombre", "Hizo"), c("id", "ID"),
    ],
  },
  {
    nombre: "Movimientos de stock", tabla: "stock_movimientos", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("producto_id", "ID producto"), c("tipo", "Tipo"),
      c("cantidad", "Cantidad", "numero"), c("stock_anterior", "Stock anterior", "numero"),
      c("stock_nuevo", "Stock nuevo", "numero"), c("referencia", "Referencia"), c("usuario", "Usuario"), c("id", "ID"),
    ],
  },
  {
    nombre: "Devoluciones", tabla: "devoluciones", orden: "created_at",
    columnas: [
      c("created_at", "Fecha", "fecha"), c("venta_sale_number", "Venta N°"), c("total", "Total", "numero"),
      c("reembolso", "Reembolso"), c("motivo", "Motivo"), c("usuario_nombre", "Usuario"),
      c("venta_id", "ID venta"), c("id", "ID"),
    ],
  },
  {
    nombre: "Detalle de devoluciones", tabla: "devolucion_items", orden: "id",
    columnas: [
      c("devolucion_id", "ID devolución"), c("producto_nombre", "Producto"), c("cantidad", "Cantidad", "numero"),
      c("precio_unitario", "Precio unitario", "numero"), c("subtotal", "Subtotal", "numero"), c("producto_id", "ID producto"),
    ],
  },
  {
    nombre: "Cambios de precio", tabla: "producto_auditoria", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("producto_id", "ID producto"), c("campo", "Campo"),
      c("valor_anterior", "Antes"), c("valor_nuevo", "Después"), c("usuario_nombre", "Usuario"),
    ],
  },
  {
    nombre: "Historial de ofertas", tabla: "ofertas_historial", orden: "desde",
    columnas: [
      c("producto_nombre", "Producto"), c("tipo", "Tipo"), c("valor", "Valor", "numero"), c("cantidad", "Cantidad", "numero"),
      c("desde", "Desde", "dia"), c("hasta", "Hasta", "dia"), c("unidades_durante", "Unidades vendidas", "numero"),
      c("facturado_durante", "Facturado", "numero"), c("variacion_pct", "Variación %", "numero"),
    ],
  },
  {
    nombre: "Puntos", tabla: "puntos_mov", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("cliente_id", "ID cliente"), c("tipo", "Tipo"), c("puntos", "Puntos", "numero"),
      c("saldo_nuevo", "Saldo", "numero"), c("referencia", "Referencia"), c("usuario", "Usuario"),
    ],
  },
  {
    nombre: "Premios por compras", tabla: "premios_compras", orden: "fecha",
    columnas: [
      c("fecha", "Fecha", "fecha"), c("cliente_id", "ID cliente"), c("premio", "Premio"),
      c("compras_usadas", "Compras usadas", "numero"), c("usuario", "Usuario"),
    ],
  },
  {
    nombre: "Sorteos", tabla: "sorteos", orden: "created_at",
    columnas: [
      c("nombre", "Nombre"), c("premio", "Premio"), c("desde", "Desde", "dia"), c("hasta", "Hasta", "dia"),
      c("monto_por_chance", "Monto por chance", "numero"), c("estado", "Estado"), c("ganador_nombre", "Ganador"),
      c("chances_total", "Chances", "numero"), c("sorteado_at", "Sorteado", "fecha"),
    ],
  },
  {
    nombre: "Empleados", tabla: "usuarios", orden: "nombre",
    columnas: [
      c("nombre", "Nombre"), c("rol", "Rol"), c("email", "Correo"), c("telefono", "Teléfono"),
      c("activo", "Activo", "bool"), c("created_at", "Alta", "fecha"), c("id", "ID"),
    ],
  },
  {
    nombre: "Puestos de caja", tabla: "puestos", orden: "nombre",
    columnas: [c("nombre", "Nombre"), c("activo", "Activo", "bool"), c("created_at", "Alta", "fecha"), c("id", "ID")],
  },
  {
    nombre: "Cobros Mercado Pago", tabla: "pagos_mp_pendientes", orden: "created_at",
    columnas: [
      c("created_at", "Fecha", "fecha"), c("estado", "Estado"), c("payment_id", "ID de pago MP"),
      c("venta_id", "ID venta"), c("error_motivo", "Problema"), c("resuelto_nota", "Nota de resolución"),
      c("external_reference", "Referencia"),
    ],
  },
];

export type Celda = string | number;

export function valorCelda(valor: unknown, tipo: TipoColumna = "texto"): Celda {
  if (valor === null || valor === undefined || valor === "") return "";
  switch (tipo) {
    case "numero": {
      const n = Number(valor);
      return Number.isFinite(n) ? n : String(valor);
    }
    case "bool":
      return valor === true || valor === "true" ? "Sí" : "No";
    case "dia": {
      // "AAAA-MM-DD" sin hora: se reordena tal cual, sin pasar por Date
      // (si no, el huso horario lo correria al dia anterior).
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
      return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
    }
    case "fecha": {
      const d = new Date(String(valor));
      return Number.isNaN(d.getTime()) ? String(valor) : fmtFecha.format(d).replace(",", "");
    }
    default: {
      const texto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
      return texto.length > MAX_TEXTO_CELDA ? texto.slice(0, MAX_TEXTO_CELDA) : texto;
    }
  }
}

export function filasDeHoja(hoja: Hoja, registros: Record<string, unknown>[]): Celda[][] {
  return [
    hoja.columnas.map((col) => col.titulo),
    ...registros.map((r) => hoja.columnas.map((col) => valorCelda(r[col.campo], col.tipo))),
  ];
}

/** "Detalle de ventas": una fila por producto vendido (ventas.items es jsonb). */
export function filasDetalleVentas(ventas: Record<string, any>[]): Celda[][] {
  const filas: Celda[][] = [["Venta N°", "Fecha", "Estado", "Producto", "Cantidad", "Precio", "Subtotal", "ID producto"]];
  for (const v of ventas) {
    if (!Array.isArray(v.items)) continue;
    for (const it of v.items) {
      if (!it || typeof it !== "object") continue;
      filas.push([
        valorCelda(v.sale_number),
        valorCelda(v.created_at, "fecha"),
        valorCelda(v.estado),
        valorCelda(it.name),
        valorCelda(it.quantity, "numero"),
        valorCelda(it.price, "numero"),
        valorCelda(it.subtotal, "numero"),
        valorCelda(it.productId),
      ]);
    }
  }
  return filas;
}

export function nombreArchivoBackup(slug: string, ahora: Date = new Date()): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
  return `backup-${slug}-${dia}.xlsx`;
}
