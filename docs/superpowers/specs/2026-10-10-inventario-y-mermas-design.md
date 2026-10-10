# Recuento físico de inventario y mermas — diseño

Fecha: 2026-10-10. SQL: `supabase/45_inventario.sql` (correr antes de deployar).

## Problema

- Sin recuento físico el stock se desvía en semanas (errores de carga, roturas que nadie
  anota, robo hormiga) y el dueño deja de confiarle al sistema.
- Las pérdidas (vencidos, roturas, consumo propio) se cargaban como "Rotura" sin motivo y
  no aparecían en ningún reporte: la ganancia neta las ignoraba.

## Decisiones

| Decisión | Motivo |
|---|---|
| Recuento = foto del catálogo al abrir + conteo + cierre que ajusta | Se puede contar de a ratos, por góndola, sin frenar la venta. |
| Se abre **por rubro o todo** | Un super cuenta "Lácteos" un martes y "Bebidas" un jueves. Solo un recuento abierto por rubro. |
| Al cerrar se compara contra el **stock real de ese momento**, no contra la foto | Si se vendieron 2 unidades mientras se contaba, la diferencia no las cuenta como faltante. |
| Lo no contado no se toca | Un recuento parcial no pisa stock de lo que no se miró. |
| Ajuste con `stock_movimientos.tipo = 'ajuste'` y `referencia = 'inventario <id>'` | Sin tipo nuevo: los reportes de pérdidas filtran por la referencia. |
| Diferencia valorizada a costo (`precio_base`) | Responde "¿cuánta plata me falta?". |
| Mermas: el ajuste de stock "Rotura" pasa a **Merma** con motivo (`rotura`, `vencido`, `consumo propio`, `robo`, `otro`) en `referencia` | Sin SQL. Reportes suma las mermas y los faltantes de inventario como **Pérdidas**, valorizadas a costo, y las resta de la ganancia neta. |

## Pantalla

`/stock/inventario` (admin): abrir recuento (rubro), lista de productos con buscador y
lector de código (el escaneo enfoca la cantidad), progreso, cerrar con resumen de
diferencias, historial de recuentos cerrados.

## API

- `POST /api/inventario` abrir · `PATCH` contar · `PUT` cerrar · `DELETE` cancelar (admin).
- `/api/consultas/inventario`: `abiertos`, `detalle`, `historial` (admin).
- `/api/stock` acepta `motivo` para merma (va a `referencia`).

## Tests

- `lib/inventario.test.ts`: progreso, diferencias y resumen (lógica pura de la pantalla).
- `lib/perdidas.test.ts`: clasificación y valuación de movimientos como pérdida.
