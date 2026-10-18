# Producción del día — diseño (2026-10-18)

## Problema

Una panadería hornea todas las mañanas. Hoy, para vender el pan con control de stock hay
que cargar la producción producto por producto como ajuste de stock; la alternativa
("sin control de stock") no deja saber cuánto se horneó, cuánto se vendió ni cuánto se
tiró. Es la pregunta diaria del dueño: "¿estoy horneando de más?".

## Qué hace

1. **Marca "Lo elaboramos acá"** en el producto (`productos.elaboracion_propia`). Esos
   productos llevan control de stock (sin stock no se puede saber qué sobró): al
   marcarlo, el formulario activa el control de stock.
2. **Pantalla Producción** (`/produccion`, dueño y encargado):
   - **Producción de hoy**: lista de los productos elaborados con stock actual, producido
     hoy y vendido hoy; se tipea lo horneado y "Registrar producción" lo suma al stock.
   - **Cierre del día**: lo que sobra de cada uno. "Descartar" lo saca del stock como
     merma (motivo vencido, "sobrante del día"); si no se toca, queda para mañana.
   - **Últimos 7 días**: producido, vendido y descartado por día, y qué producto sobra
     más (para ajustar la tanda).
3. En el menú aparece para panaderías; en Stock hay un acceso para cualquier rubro que
   tenga productos elaborados.

## Datos (migración `68_produccion.sql`)

```sql
alter table productos add column if not exists elaboracion_propia boolean not null default false;
```

No hay tabla nueva: la producción es un movimiento `entrada` con referencia
`produccion` (vía `ajustar_stock_kiosko`, como cualquier entrada) y el descarte una
merma (`rotura`, referencia `merma:vencido · sobrante del día`). Así el stock, el
historial del producto y el reporte de pérdidas siguen funcionando sin cambios.

## Cálculo

`lib/produccion.ts` (puro, testeado) agrupa los movimientos de stock de los productos
elaborados por día argentino: producido = entradas `produccion`, vendido = ventas menos
anulaciones/devoluciones, descartado = mermas "sobrante del día".
`/api/consultas/produccion` trae los movimientos de los últimos N días (filtrado por
comercio) y devuelve el resumen.

## Permisos

Registrar producción y descartar usan `/api/stock` (admin y encargado, como cualquier
cambio de stock). La consulta es de lectura.

## Fuera de alcance

- Recetas e insumos (descontar harina por kilo de pan).
- Planificar la producción sugerida según lo vendido (se puede sumar con el resumen).
