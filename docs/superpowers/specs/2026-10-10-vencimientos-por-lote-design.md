# Vencimientos por lote, IVA por producto y reportes por hora — diseño

Fecha: 2026-10-10. SQL: `supabase/46_vencimientos_por_lote.sql` y `supabase/47_iva_producto.sql`
(correr después de la 44 y antes de deployar).

## Vencimientos por lote

**Problema**: un solo `fecha_vencimiento` por producto. Una despensa recibe tres partidas de
yogur con fechas distintas y solo podía anotar una.

| Decisión | Motivo |
|---|---|
| Tabla `producto_lotes` (fecha, cantidad, compra de origen, activo) | Varios lotes por producto sin tocar el resto del sistema. |
| `productos.fecha_vencimiento` = lote activo más próximo (`sincronizar_vencimiento_producto`) | Los avisos de Stock e Inicio, el filtro "Vencen esta semana" y las ofertas por vencimiento siguen funcionando sin cambios. |
| Un producto sin lotes conserva la fecha manual; uno que tuvo lotes y ya no tiene activos queda sin fecha | Para el kiosko que nunca usa lotes nada cambia. |
| La recepción de compra acepta fecha por ítem y crea el lote | Es el momento natural: el remito en la mano. |
| Lotes a mano y "dar de baja" desde Editar producto | Cuando se termina o se tira un lote, se da de baja y la fecha pasa al siguiente. Dar de baja no toca stock: si se tiró mercadería, se registra la merma aparte. |
| Las ventas no descuentan de los lotes | Llevar FIFO por lote en la venta es otro nivel de complejidad. La cantidad del lote es informativa ("entraron 24"). |

API: `POST /api/lotes` (crear a mano), `DELETE /api/lotes` (baja); consulta `lotes` en
`/api/consultas/productos`.

## IVA por producto

`productos.iva` (0, 2.5, 5, 10.5, 21, 27; default 21). Editable en Producto nuevo y Editar
producto. Hoy solo se guarda: lo va a usar la Factura A/B. No se toca el importador de Excel
(el default 21 cubre a la mayoría; lo distinto se corrige a mano).

## Reportes

Sin SQL. `lib/server/reportes.ts` suma:
- **Ventas por hora** y **por día de la semana** (hora argentina, no la del servidor).
- **Gastos por categoría** (migración 44).
- **Pérdidas**: mermas (`rotura`) y faltantes de inventario, valorizadas a costo, restadas
  de la ganancia neta.
- Corrige el corte de día de "Ventas por día", que usaba la zona horaria del servidor (UTC en Vercel).

Lógica pura y testeada en `lib/reportes-tiempo.ts`.
