# Cuenta corriente de proveedores, bultos y categoría de gastos — diseño

Fecha: 2026-10-10. SQL: `supabase/44_proveedores_cuenta_corriente.sql` (correr antes de deployar).

## Problema

- Las compras solo sabían `pagada` sí o no. No había pagos parciales, ni "cuánto le debo a
  la distribuidora", ni historial de pagos. Para una despensa, la deuda con proveedores
  pesa tanto como el fiado de los clientes.
- Los gastos de caja tenían concepto libre: imposible saber cuánto se va en alquiler,
  luz o sueldos.
- Se compra la caja de 12 y se vende suelto: en la recepción había que multiplicar a mano.
  El dato "unidades por paquete" ya existía en `productos.lote`, solo no se usaba ahí.

## Decisiones

| Decisión | Motivo |
|---|---|
| `compras.pagado` (numérico) en vez de solo `pagada` | Saldo por compra = `total - pagado`. `pagada` se mantiene sincronizada para no romper lo que ya la lee. |
| Tabla `proveedor_pagos` con `aplicado` (JSON `[{compraId, monto}]`) | Un pago "a cuenta" se reparte a las compras con saldo más viejas primero (FIFO). Guardar a qué se aplicó permite anular el pago y devolver el saldo exacto. |
| RPC `registrar_pago_proveedor` atómica | Reparte el pago, actualiza las compras y, si es **efectivo con caja abierta**, deja un `gasto` de caja con categoría `mercaderia`. Así el arqueo cierra sin cargar el gasto dos veces. |
| El pago no puede superar la deuda | Evita saldos a favor, que complicarían todo. Si el dueño pagó de más, lo registra cuando entre la próxima compra. |
| `anular_pago_proveedor` | Devuelve el saldo a las compras. Borra el gasto de caja solo si esa caja sigue abierta; si ya se cerró, el gasto se conserva (el arqueo quedó hecho) y la UI avisa. |
| Una compra con pagos no se puede anular | Primero se anulan sus pagos. Dejar plata "pagada" sobre una compra anulada era un agujero. |
| `compras.vence` (fecha pactada, opcional) | Para ordenar qué pagar primero. Sin recordatorios por ahora. |
| `caja_movimientos.categoria` solo para gastos | `mercaderia`, `servicios`, `alquiler`, `sueldos`, `impuestos`, `otros`. Opcional: los gastos viejos quedan sin categoría. Reporte "Gastos por categoría" en `/reportes`. |
| Bultos en la recepción: columna "Bultos" cuando el producto tiene `lote > 1` | Escribir 3 bultos llena 36 unidades. El costo sigue siendo por unidad (es lo que usa el margen). |

## Pantallas

- `/compras` → pestaña nueva **Cuenta corriente**: tarjetas por proveedor con saldo,
  botón **Registrar pago** (monto, forma de pago, caja si es efectivo, compra puntual o a
  cuenta, nota), compras con saldo y pagos hechos (con anular).
- El historial de compras muestra el saldo de cada una en vez de "impaga".
- Caja → Gasto: selector de categoría.
- Reportes: tabla "Gastos por categoría".

## API

- `POST /api/proveedores/pagos` (admin) → `registrar_pago_proveedor`.
- `DELETE /api/proveedores/pagos` (admin) → `anular_pago_proveedor`.
- `/api/consultas/compras`: acciones `saldosProveedores`, `comprasConSaldo`, `pagosProveedor`.
- `/api/caja/movimiento`: acepta `categoria`.

## Recordatorios de vencimiento (agregado el mismo día)

- La fecha pactada (`compras.vence`) se carga en la recepción cuando la compra queda
  impaga ("¿Cuándo hay que pagarla?") y se puede cambiar en Cuenta corriente. La RPC de
  recepción no cambió de firma: la ruta `POST /api/compras` guarda la fecha aparte, y
  `PATCH /api/compras` la edita (admin).
- `lib/proveedores-vencimientos.ts` (puro, testeado): vencido / vence hoy / vence en N
  días (hasta 7) / más adelante / sin fecha, resumen con montos y orden por urgencia.
- Dónde se ve: tarjeta **Pagos a proveedores** en el inicio (solo admin; rojo si hay
  vencidas, amarillo si vencen esta semana; lleva a `/compras?tab=cuenta`), resumen en la
  tarjeta de deuda de Cuenta corriente y una columna "Pagar antes del" por compra, con las
  compras ordenadas por urgencia.
- Sin notificaciones push ni correos: el dueño abre el inicio todos los días y ahí lo ve.

## Tests

- `lib/proveedores-saldo.test.ts`: reparto FIFO de un pago y resumen de saldos (misma
  regla que la RPC, para la vista previa en pantalla).
- `lib/proveedores-vencimientos.test.ts`: estados, textos, resumen y orden por urgencia.
