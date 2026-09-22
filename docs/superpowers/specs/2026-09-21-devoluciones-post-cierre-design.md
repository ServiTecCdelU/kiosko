# Devoluciones con caja cerrada — Spec de diseño

- **Fecha**: 2026-09-21
- **Fase**: 3 del `docs/PLAN-MAESTRO-2026-09-18.md` (ítem 3.5, último de la fase)
- **Estado**: diseño — el SQL de la sección 2 debe ejecutarlo el usuario ANTES de implementar código.

---

## 1. Problema

`anular_venta_kiosko` (`supabase/09_anulacion_caja_mov.sql`) exige que la caja
de la venta **siga abierta**:

```sql
if not exists (
  select 1 from caja
  where id = v_venta.caja_id and estado = 'abierta' and comercio_id = p_comercio_id
) then
  raise exception 'No se puede anular: la caja de esta venta ya fue cerrada';
```

Correcto para el caso que cubre: no se puede alterar retroactivamente un
arqueo ya cerrado y firmado. Pero un súper recibe devoluciones de compras de
**días anteriores**, con la caja de esa venta cerrada hace tiempo. Hoy no hay
forma de procesarlas sin tocar la base a mano.

## 2. Decisiones de diseño

| Decisión | Motivo |
|---|---|
| **Registro nuevo** (`devoluciones` + `devolucion_items`), la venta original **no se toca** | `anular_venta_kiosko` marca la venta como `anulada`, lo que retroactivamente cambiaría el total vendido de un arqueo ya cerrado — exactamente lo que la restricción actual protege. La devolución es un evento aparte que *referencia* la venta original; el historial del día en que se vendió queda intacto. |
| **Devolución parcial**, item por item con cantidad | "Devolvió 1 de las 3 gaseosas" es el caso real; todo-o-nada obligaría a re-vender lo que no se devuelve. |
| El efectivo reembolsado sale de la **caja de HOY** como `caja_movimientos` tipo `gasto`, no se toca la caja cerrada de la venta original | Es lo que pasa físicamente: la plata sale del cajón actual. Reutiliza la tabla existente, sin tocar su esquema. Requiere una caja abierta del comercio (la del cajero que atiende la devolución). |
| Si la venta original era **fiado**, se revierte el saldo del cliente automáticamente (no exige caja abierta) | No hay efectivo físico involucrado; es ajuste de cuenta corriente, mismo criterio que ya usa `anular_venta_kiosko` para fiado. |
| Reembolso `ninguno` (cambio por otro producto / vale) además de `efectivo` | No todo el mundo devuelve la plata: en un cambio de producto no sale efectivo del cajón. Modelar el intercambio en sí queda fuera de alcance — el cajero hace la devolución y, si corresponde, una venta nueva aparte. |
| **No se puede devolver más de lo que la venta tiene, descontando devoluciones previas de esa misma venta** | Evita devolver de más por error o abuso; la RPC lo valida sumando `devolucion_items` históricos de la venta. |
| La devolución **no se anula** (a diferencia de compras/ventas) | Es ya el mecanismo de reversión de otra cosa; revertir una reversión es un caso límite que no vale la complejidad ahora. Un error de carga se corrige con una nota y, si hace falta, ajuste manual — igual que hoy. |
| El stock vuelve con el tipo **`devolucion`** ya existente | Mismo tipo que usa `anular_venta_kiosko`; cero cambios en checks de `stock_movimientos`. |
| Pantalla: se agrega a **`/ventas`**, no una pantalla nueva | La devolución arranca siempre desde encontrar la venta original; `/ventas` ya lista y filtra ventas. Se agrega el botón "Devolver" junto al de "Anular" existente, visible incluso si la caja de esa venta ya cerró (a diferencia de Anular, que sigue exigiendo caja abierta). |

## 3. Cambios de esquema (SQL exacto — ejecutar ANTES de codear)

Archivo nuevo: `supabase/29_devoluciones.sql`. No destructivo.

```sql
-- 29_devoluciones.sql
-- Devolucion de items de una venta con la caja de esa venta ya cerrada.
-- Spec: docs/superpowers/specs/2026-09-21-devoluciones-post-cierre-design.md

-- ------------------------------------------------------------
-- 1. Devoluciones (cabecera) e items
-- ------------------------------------------------------------
create table if not exists devoluciones (
  id               text primary key,
  comercio_id      text not null references comercios(id),
  venta_id         text not null references ventas(id),
  venta_sale_number text,                     -- copia para mostrar sin joinear
  motivo           text,
  reembolso        text not null default 'ninguno'
                     check (reembolso in ('efectivo','ninguno')),
  caja_id          text references caja(id),  -- caja de HOY donde salio el efectivo (si aplica)
  total            numeric not null default 0,
  usuario_id       text,
  usuario_nombre   text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_devoluciones_venta on devoluciones (venta_id);
create index if not exists idx_devoluciones_comercio_fecha on devoluciones (comercio_id, created_at desc);

create table if not exists devolucion_items (
  id              bigint generated always as identity primary key,
  devolucion_id   text not null references devoluciones(id) on delete cascade,
  comercio_id     text not null references comercios(id),
  producto_id     text not null,
  producto_nombre text not null,
  cantidad        numeric not null check (cantidad > 0),
  precio_unitario numeric not null,
  subtotal        numeric not null
);
create index if not exists idx_devolucion_items_devolucion on devolucion_items (devolucion_id);
create index if not exists idx_devolucion_items_venta_producto on devolucion_items (comercio_id, producto_id);

-- ------------------------------------------------------------
-- 2. RPC atomica de devolucion
-- ------------------------------------------------------------
create or replace function registrar_devolucion_kiosko(
  p_comercio_id    text,
  p_venta_id       text,
  p_items          jsonb,   -- [{productoId, cantidad}]
  p_motivo         text default null,
  p_reembolso      text default 'ninguno',
  p_caja_id        text default null,   -- obligatoria si p_reembolso = 'efectivo'
  p_usuario_id     text default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta          record;
  v_devolucion_id  text := 'devol_' || to_char(now(), 'YYYYMMDD') || '_' ||
                           substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_item           jsonb;
  v_venta_item     jsonb;
  v_producto       record;
  v_cantidad       numeric;
  v_ya_devuelto    numeric;
  v_precio         numeric;
  v_total          numeric := 0;
  v_saldo_actual   numeric;
  v_saldo_nuevo    numeric;
begin
  if p_reembolso not in ('efectivo','ninguno') then
    raise exception 'Reembolso invalido';
  end if;

  select * into v_venta from ventas
  where id = p_venta_id and comercio_id = p_comercio_id
  for update;
  if not found then
    raise exception 'La venta % no existe en este comercio', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya esta anulada, no se puede devolver';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La devolucion no tiene items';
  end if;

  if p_reembolso = 'efectivo' then
    if p_caja_id is null then
      raise exception 'Falta indicar la caja de hoy para el reembolso en efectivo';
    end if;
    if not exists (
      select 1 from caja where id = p_caja_id and estado = 'abierta' and comercio_id = p_comercio_id
    ) then
      raise exception 'La caja indicada para el reembolso no esta abierta';
    end if;
  end if;

  insert into devoluciones (id, comercio_id, venta_id, venta_sale_number, motivo,
                            reembolso, caja_id, total, usuario_id, usuario_nombre)
  values (v_devolucion_id, p_comercio_id, p_venta_id, v_venta.sale_number, p_motivo,
          p_reembolso, p_caja_id, 0, p_usuario_id, p_usuario_nombre);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad invalida en un item';
    end if;

    -- Item tal como esta en la venta original (para el precio y validar tope)
    select * into v_venta_item
      from jsonb_array_elements(v_venta.items) x
      where x->>'productId' = v_item->>'productoId'
      limit 1;
    if v_venta_item is null then
      raise exception 'El producto % no esta en la venta original', v_item->>'productoId';
    end if;
    v_precio := (v_venta_item->>'price')::numeric;

    select coalesce(sum(di.cantidad), 0) into v_ya_devuelto
      from devolucion_items di
      join devoluciones d on d.id = di.devolucion_id
      where d.venta_id = p_venta_id and di.producto_id = v_item->>'productoId';

    if v_ya_devuelto + v_cantidad > (v_venta_item->>'quantity')::numeric then
      raise exception 'No se puede devolver mas de lo vendido para %', v_item->>'productoId';
    end if;

    select id, name, stock into v_producto
      from productos
      where id = v_item->>'productoId' and comercio_id = p_comercio_id
      for update;

    if found then
      update productos
        set stock = stock + v_cantidad, updated_at = now()
        where id = v_producto.id and comercio_id = p_comercio_id;

      insert into stock_movimientos
        (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_producto.id, 'devolucion', v_cantidad,
         v_producto.stock, v_producto.stock + v_cantidad,
         'Devolucion venta ' || coalesce(v_venta.sale_number, v_venta.id), p_usuario_nombre, now());
    end if;
    -- Producto borrado del catalogo: se registra la devolucion igual, sin stock que sumar.

    insert into devolucion_items (devolucion_id, comercio_id, producto_id, producto_nombre,
                                  cantidad, precio_unitario, subtotal)
    values (v_devolucion_id, p_comercio_id, v_item->>'productoId',
            coalesce(v_venta_item->>'name', v_item->>'productoId'),
            v_cantidad, v_precio, v_cantidad * v_precio);

    v_total := v_total + v_cantidad * v_precio;
  end loop;

  update devoluciones set total = v_total where id = v_devolucion_id;

  -- Efectivo: sale del cajon de HOY como gasto (reutiliza caja_movimientos, sin tocar su esquema).
  if p_reembolso = 'efectivo' then
    insert into caja_movimientos (id, comercio_id, caja_id, tipo, monto, concepto, usuario_id, usuario_nombre, fecha)
    values (gen_random_uuid()::text, p_comercio_id, p_caja_id, 'gasto', v_total,
            'Devolucion venta ' || coalesce(v_venta.sale_number, v_venta.id), p_usuario_id, p_usuario_nombre, now());
  end if;

  -- Fiado: se revierte el saldo del cliente por lo devuelto (no es efectivo fisico).
  if v_venta.payment_method = 'fiado' and v_venta.cliente_id is not null then
    select saldo into v_saldo_actual from clientes
      where id = v_venta.cliente_id and comercio_id = p_comercio_id
      for update;
    if found then
      v_saldo_nuevo := v_saldo_actual - v_total;
      update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = v_venta.cliente_id;
      insert into cuenta_corriente_mov
        (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, venta_id, referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_venta.cliente_id, 'ajuste', -v_total,
         v_saldo_actual, v_saldo_nuevo, v_venta.id,
         'Devolucion venta ' || coalesce(v_venta.sale_number, v_venta.id), p_usuario_nombre, now());
    end if;
  end if;

  return jsonb_build_object('devolucionId', v_devolucion_id, 'total', v_total);
end;
$$;
```

**No cambia nada existente**: `anular_venta_kiosko` sigue igual (misma-caja-abierta);
`caja_movimientos` y `stock_movimientos` no cambian de esquema, solo se insertan
filas con tipos que ya existen.

## 4. Cambios de aplicación

### 4.1 API

| Ruta / acción | Detalle |
|---|---|
| `app/api/ventas/devolver/route.ts` (nueva) | POST, valida con zod, llama `registrar_devolucion_kiosko`. `comercioId` de sesión. Si `reembolso='efectivo'`, `caja_id` sale de la caja abierta del usuario (resuelta server-side vía `cajaDelUsuario`, no confiada del body). |
| `consultas/ventas` acción nueva `devolucionesDeVenta` | Lista de devoluciones ya hechas a una venta (para saber cuánto queda disponible a devolver antes de abrir el diálogo). |

### 4.2 Servicio

`services/sales-service.ts`: agregar `registrarDevolucion()` y `getDevolucionesDeVenta()`.

### 4.3 UI — `/ventas`

- Botón **"Devolver"** en el detalle de cada venta vigente (`SaleDetailDialog`),
  visible siempre (a diferencia de "Anular", que ya está condicionado a caja
  abierta — ver `esAdmin`/`v.estado` en `sale-detail-dialog.tsx`).
- Diálogo nuevo `DevolucionDialog`: lista los items de la venta con la cantidad
  ya devuelta (si hubo devoluciones previas) y un input de cantidad a devolver
  por item (tope = pendiente); motivo; si el medio de pago de la venta fue
  efectivo/transferencia/tarjeta, radio **Reembolso: Efectivo del cajón de hoy
  / Sin reembolso (cambio)** — si la venta fue fiado, no se pregunta: siempre
  ajusta cuenta corriente.
- Si se elige "Efectivo" y el usuario no tiene caja abierta hoy, el diálogo
  avisa y bloquea esa opción (deja solo "Sin reembolso").

## 5. Casos borde

| Caso | Comportamiento |
|---|---|
| Devolver una venta de hace 3 semanas | Funciona: no depende del estado de la caja original. |
| Devolver dos veces la misma unidad | La RPC lo rechaza sumando devoluciones previas contra la cantidad vendida. |
| Producto borrado del catálogo | La devolución se registra igual, sin stock que sumar (mismo criterio que anulación). |
| Venta ya anulada | Rechazada: no tiene sentido devolver algo que ya se revirtió entero. |
| Reembolso efectivo sin caja abierta | La API rechaza con mensaje claro; la UI ya lo previene deshabilitando la opción. |
| Venta fiado con devolución parcial | El cliente debe menos, proporcional a lo devuelto; no toca caja. |

## 6. Fuera de alcance (a propósito)

- Anular una devolución ya hecha.
- Modelar el "cambio por otro producto" como una operación atómica (queda:
  devolución + venta nueva, dos pasos manuales del cajero).
- Devolución de compras a proveedores (es otro flujo, ya cubierto parcialmente
  por `anular_compra_kiosko`).

## 7. Testing

- **`npm run test:db`**: devolución parcial revierte stock y no permite superar
  lo vendido; devolución con reembolso efectivo crea el `caja_movimientos` tipo
  `gasto` en la caja de hoy; devolución de venta fiado ajusta el saldo del
  cliente; reembolso efectivo sin caja abierta falla; venta anulada rechaza.
- Manual: vender, cerrar caja, abrir una nueva, devolver un item de la venta
  del día anterior con reembolso efectivo — verificar el gasto en la caja de
  hoy y el stock repuesto.

## 8. Orden de implementación

1. SQL `29_devoluciones.sql` → **usuario ejecuta** (prod y base de prueba).
2. API: `/api/ventas/devolver`, acción `devolucionesDeVenta`.
3. `services/sales-service.ts`.
4. `DevolucionDialog` + botón en `SaleDetailDialog` / `/ventas`.
5. Tests db + build + commit único.
