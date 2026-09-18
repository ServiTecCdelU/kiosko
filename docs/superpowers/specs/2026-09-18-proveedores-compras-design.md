# Proveedores y recepción de mercadería — Spec de diseño

- **Fecha**: 2026-09-18
- **Fase**: 3 del `docs/PLAN-MAESTRO-2026-09-18.md` (ítems 3.1 y 3.2)
- **Estado**: diseño — el SQL de la sección 3 debe ejecutarlo el usuario ANTES de implementar código.

---

## 1. Problema

Hoy la mercadería entra al sistema de dos maneras:

- **Sincronización de catálogo** con la distribuidora (nombre/precio/categoría;
  nunca stock).
- **Ajuste de stock genérico** (`ajustar_stock_kiosko`, tipos
  `entrada`/`ajuste`/`rotura`) sin proveedor, sin costo y sin comprobante.

Un súper o despensa recibe de **varios proveedores** (distribuidora, fiambrería,
verdulería, gaseosas, panificados) y necesita responder:

- ¿Qué entró, cuándo, de quién y a qué costo? (hoy: nada de eso queda)
- ¿Cuál es el margen real de cada producto? (`precio_base` existe en `productos`
  pero es un único valor que se pisa; no hay historial)
- ¿Cuánto le compré a cada proveedor este mes? (imposible)

## 2. Decisiones de diseño

| Decisión | Motivo |
|---|---|
| **Compra = recepción directa**, sin flujo de "orden de compra → pendiente → recibida" | YAGNI: en el mostrador real se registra la mercadería cuando llega el reparto, con el remito en la mano. Un flujo de OC es burocracia que nadie va a cargar. Si algún día hace falta, se agrega un estado. |
| RPC **`recibir_compra_kiosko` atómica** | Igual criterio que `process_sale_kiosko`: cabecera + items + suma de stock + actualización de costo en una sola transacción. O entra todo o no entra nada. |
| El stock entra con el tipo **`entrada` existente**, con `referencia = id de la compra` | No hace falta un tipo nuevo de movimiento: `entrada` ya significa "vino mercadería"; la referencia lo ata al comprobante. Cero cambios en checks ni reportes de stock. |
| Cada item guarda **`costo_unitario`** y la compra actualiza **`productos.precio_base`** con el último costo | `precio_base` sigue siendo "el costo vigente" (lo que ya usan los reportes de margen); el historial fino queda en `compra_items`. |
| **El precio de venta NO se toca automáticamente** | Subir el costo no debe cambiar el precio al público sin decisión humana. La pantalla muestra el margen resultante y deja ajustar el precio ahí mismo, pero es acción explícita (vía la edición de producto existente). |
| La compra se puede **anular** (misma filosofía que ventas: nunca borrar) | Se marca `estado='anulada'`, se descuenta el stock que había sumado (movimiento `ajuste` negativo con referencia) y NO se revierte `precio_base` (el costo vigente ya pudo cambiar por otra compra). |
| Productos de la compra que no existen en el catálogo | No se resuelve acá: se crean antes con el alta rápida existente (`quick-create-product-dialog`) o por sync. La compra solo referencia productos existentes. |
| Pago de la compra: campo informativo `condicion` (`contado`/`cuenta_corriente`) + `pagada` boolean | Contabilidad de proveedores completa (cta. cte. de proveedores, vencimientos) es otra fase; hoy alcanza con saber qué quedó impaga. Un gasto de caja (`caja_movimientos` tipo `gasto`) ya cubre la salida de plata si se paga en efectivo del cajón. |
| Pantalla nueva **`/compras`** (admin), no mezclada en `/stock` | `/stock` ya es densa; compras tiene su propio ciclo (proveedores + recepciones + historial). Nav item admin-only. |
| Proveedores: CRUD mínimo (nombre, teléfono, notas, activo) | Sin CUIT/dirección/email hasta que haga falta facturación de compras. |

### Margen real (ítem 3.2, se resuelve gratis con esto)

Con `compra_items.costo_unitario` el margen deja de depender de un `precio_base`
manual: el costo vigente se actualiza con cada recepción. Los reportes existentes
que ya usan `precio_base` mejoran sin tocarlos. (Un reporte de "margen histórico
por período" queda para la fase de reportes.)

## 3. Cambios de esquema (SQL exacto — ejecutar ANTES de codear)

Archivo nuevo: `supabase/27_proveedores_compras.sql`. No destructivo.

```sql
-- 27_proveedores_compras.sql
-- Proveedores y recepcion de mercaderia (compras) con costo por item.
-- Spec: docs/superpowers/specs/2026-09-18-proveedores-compras-design.md

-- ------------------------------------------------------------
-- 1. Proveedores
-- ------------------------------------------------------------
create table if not exists proveedores (
  id          text primary key,
  comercio_id text not null references comercios(id),
  nombre      text not null,
  telefono    text,
  notas       text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (comercio_id, nombre)
);
create index if not exists idx_proveedores_comercio on proveedores (comercio_id) where activo;

-- ------------------------------------------------------------
-- 2. Compras (cabecera) e items
-- ------------------------------------------------------------
create table if not exists compras (
  id             text primary key,
  comercio_id    text not null references comercios(id),
  proveedor_id   text not null references proveedores(id),
  estado         text not null default 'recibida'
                   check (estado in ('recibida','anulada')),
  remito         text,                        -- nro de remito/factura del proveedor
  condicion      text not null default 'contado'
                   check (condicion in ('contado','cuenta_corriente')),
  pagada         boolean not null default true,
  total          numeric not null default 0,  -- suma de items (lo calcula la RPC)
  notas          text,
  usuario_id     text,
  usuario_nombre text,
  anulada_at     timestamptz,
  anulada_por    text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_compras_comercio_fecha on compras (comercio_id, created_at desc);
create index if not exists idx_compras_proveedor on compras (proveedor_id);

create table if not exists compra_items (
  id             bigint generated always as identity primary key,
  compra_id      text not null references compras(id) on delete cascade,
  comercio_id    text not null references comercios(id),
  producto_id    text not null,
  producto_nombre text not null,              -- copia al momento (el catalogo cambia)
  cantidad       numeric not null check (cantidad > 0),
  costo_unitario numeric not null check (costo_unitario >= 0),
  subtotal       numeric not null
);
create index if not exists idx_compra_items_compra on compra_items (compra_id);
create index if not exists idx_compra_items_producto on compra_items (producto_id);

-- ------------------------------------------------------------
-- 3. RPC atomica de recepcion
--    Inserta cabecera + items, suma stock (movimiento 'entrada' con
--    referencia a la compra) y actualiza el costo vigente (precio_base).
-- ------------------------------------------------------------
create or replace function recibir_compra_kiosko(
  p_comercio_id    text,
  p_proveedor_id   text,
  p_items          jsonb,   -- [{productoId, cantidad, costoUnitario}]
  p_remito         text default null,
  p_condicion      text default 'contado',
  p_pagada         boolean default true,
  p_notas          text default null,
  p_usuario_id     text default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra_id text := 'compra_' || to_char(now(), 'YYYYMMDD') || '_' ||
                      substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_item      jsonb;
  v_producto  record;
  v_cantidad  numeric;
  v_costo     numeric;
  v_total     numeric := 0;
  v_n_items   integer := 0;
begin
  if p_condicion not in ('contado','cuenta_corriente') then
    raise exception 'Condicion invalida';
  end if;
  if not exists (
    select 1 from proveedores
    where id = p_proveedor_id and comercio_id = p_comercio_id and activo
  ) then
    raise exception 'Proveedor inexistente o inactivo';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene items';
  end if;

  insert into compras (id, comercio_id, proveedor_id, remito, condicion, pagada,
                       total, notas, usuario_id, usuario_nombre)
  values (v_compra_id, p_comercio_id, p_proveedor_id, p_remito, p_condicion,
          p_pagada, 0, p_notas, p_usuario_id, p_usuario_nombre);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_costo    := (v_item->>'costoUnitario')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad invalida en un item';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Costo invalido en un item';
    end if;

    select id, name, stock into v_producto
    from productos
    where id = v_item->>'productoId' and comercio_id = p_comercio_id
    for update;
    if not found then
      raise exception 'Producto % inexistente', v_item->>'productoId';
    end if;

    insert into compra_items (compra_id, comercio_id, producto_id, producto_nombre,
                              cantidad, costo_unitario, subtotal)
    values (v_compra_id, p_comercio_id, v_producto.id, v_producto.name,
            v_cantidad, v_costo, v_cantidad * v_costo);

    update productos
      set stock = stock + v_cantidad,
          precio_base = v_costo,             -- costo vigente = ultimo costo pagado
          updated_at = now()
      where id = v_producto.id and comercio_id = p_comercio_id;

    insert into stock_movimientos
      (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
       referencia, usuario, fecha)
    values
      ('mov_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
       p_comercio_id, v_producto.id, 'entrada', v_cantidad,
       v_producto.stock, v_producto.stock + v_cantidad,
       v_compra_id, p_usuario_nombre, now());

    v_total := v_total + v_cantidad * v_costo;
    v_n_items := v_n_items + 1;
  end loop;

  update compras set total = v_total where id = v_compra_id;

  return jsonb_build_object('compraId', v_compra_id, 'total', v_total, 'items', v_n_items);
end;
$$;

-- ------------------------------------------------------------
-- 4. RPC de anulacion (nunca borrar; revierte el stock, no el costo)
-- ------------------------------------------------------------
create or replace function anular_compra_kiosko(
  p_compra_id   text,
  p_comercio_id text,
  p_usuario_id  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra record;
  v_item   record;
  v_stock  numeric;
begin
  select * into v_compra from compras
  where id = p_compra_id and comercio_id = p_comercio_id
  for update;
  if not found then
    raise exception 'Compra inexistente';
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La compra ya esta anulada';
  end if;

  for v_item in
    select * from compra_items where compra_id = p_compra_id
  loop
    select stock into v_stock from productos
    where id = v_item.producto_id and comercio_id = p_comercio_id
    for update;
    if found then
      update productos
        set stock = stock - v_item.cantidad, updated_at = now()
        where id = v_item.producto_id and comercio_id = p_comercio_id;
      insert into stock_movimientos
        (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario, fecha)
      values
        ('mov_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
         p_comercio_id, v_item.producto_id, 'ajuste', -v_item.cantidad,
         v_stock, v_stock - v_item.cantidad,
         'anulacion ' || p_compra_id, p_usuario_id, now());
    end if;
    -- Producto borrado del catalogo: se anula igual, sin tocar stock
    -- (mismo criterio que anular_venta_kiosko).
  end loop;

  update compras
    set estado = 'anulada', anulada_at = now(), anulada_por = p_usuario_id
    where id = p_compra_id;
end;
$$;
```

**No cambia nada existente**: ni checks de `stock_movimientos`, ni RPC de
ventas/caja, ni la sincronización (que sigue sin tocar stock; si la sync también
escribe `precio_base`, el último que escribe gana — comportamiento aceptado).

## 4. Cambios de aplicación

### 4.1 API

| Ruta / acción | Detalle |
|---|---|
| `app/api/proveedores/route.ts` (nueva) | POST crear / PATCH editar (nombre, teléfono, notas, activo). Patrón de `/api/puestos`. `comercioId` de sesión. |
| `app/api/compras/route.ts` (nueva) | POST → valida con zod y llama `recibir_compra_kiosko`. |
| `app/api/compras/anular/route.ts` (nueva) | POST → `anular_compra_kiosko` (solo admin/encargado, chequeo client-side como el resto). |
| `consultas/compras` (nueva ruta de lecturas) | Acciones cerradas: `proveedores`, `compras` (lista con proveedor, filtro por proveedor/fecha, límite), `compraDetalle` (cabecera + items), `comprasPorProveedor` (totales del período). |

### 4.2 Servicio

`services/compras-service.ts`: mapeos + `getProveedores`, `crearProveedor`,
`actualizarProveedor`, `recibirCompra`, `anularCompra`, `getCompras`,
`getCompraDetalle`.

### 4.3 Pantalla `/compras` (admin-only, nav nuevo con ícono Truck)

- **Tab "Recepción"** (la default): selector de proveedor + buscador de productos
  (reutiliza la búsqueda del POS) + tabla de items (cantidad, costo unitario,
  subtotal) + remito/condición/pagada + botón **Registrar compra**. Al agregar un
  item muestra el margen resultante (`price` vs costo nuevo) con alerta visual
  si queda negativo.
- **Tab "Historial"**: compras con fecha, proveedor, remito, total, estado;
  click → detalle con items; botón Anular (con confirmación) en compras vigentes.
- **Tab "Proveedores"**: CRUD mínimo en tabla + diálogo (patrón `/usuarios`).

### 4.4 Nav y permisos

- `lib/nav.ts`: item "Compras" (`/compras`, ícono `Truck`) admin-only.
- Anular compra: admin y encargado (matriz de multi-caja) — pero la pantalla es
  admin-only por ahora, así que en la práctica solo admin. Si el encargado la
  necesita, es una línea en nav.

## 5. Casos borde

| Caso | Comportamiento |
|---|---|
| Compra con producto que se borra del catálogo después | El detalle sigue completo (`producto_nombre` copiado). La anulación no toca stock de productos inexistentes. |
| Dos recepciones simultáneas del mismo producto | `for update` en la RPC serializa; el stock queda bien. |
| Costo 0 | Permitido (bonificaciones/regalos del proveedor). |
| Producto pesable (kg) | `cantidad` es numeric: 3.5 kg funciona igual. |
| Anular compra con stock ya vendido | Se descuenta igual (puede quedar stock negativo, comportamiento ya aceptado en ajustes); el movimiento queda auditado. |
| Proveedor desactivado con compras históricas | El historial lo sigue mostrando; solo se bloquean recepciones nuevas. |

## 6. Fuera de alcance (a propósito)

- Órdenes de compra con estados / mercadería pendiente de recibir.
- Cuenta corriente de proveedores (vencimientos, pagos parciales).
- Devolución parcial a proveedor (anulación es todo-o-nada).
- Sugerencia de reposición (ítem 3.5 del plan — spec propio, usa estos datos).
- Reporte de margen histórico por período (fase de reportes).

## 7. Testing

- **`npm run test:db`**: recibir compra suma stock y actualiza `precio_base`;
  compra con items inválidos no deja nada a medias; anulación revierte stock y
  marca estado; proveedor inactivo rechaza.
- **`npm test`**: cálculo de totales/margen de la pantalla si se extrae a
  `lib/compras.ts` (subtotales, margen % resultante).
- Manual: recepción de 3 items, verificación en `/stock` (movimientos con
  referencia) y margen en el producto.

## 8. Orden de implementación

1. SQL `27_proveedores_compras.sql` → **usuario ejecuta** (prod y base de prueba).
2. `lib/compras.ts` (totales/margen puro) + test.
3. API: proveedores, compras, anular, consultas.
4. `services/compras-service.ts`.
5. Pantalla `/compras` (3 tabs) + nav.
6. Tests db + build + commit único.
