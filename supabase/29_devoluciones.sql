-- 29_devoluciones.sql
-- Devolucion de items de una venta con la caja de esa venta ya cerrada.
-- Spec: docs/superpowers/specs/2026-09-21-devoluciones-post-cierre-design.md
-- No destructivo. Correr el archivo completo en el SQL Editor de Supabase.

-- ------------------------------------------------------------
-- 1. Devoluciones (cabecera) e items
-- ------------------------------------------------------------
create table if not exists devoluciones (
  id                text primary key,
  comercio_id       text not null references comercios(id),
  venta_id          text not null references ventas(id),
  venta_sale_number text,                     -- copia para mostrar sin joinear
  motivo            text,
  reembolso         text not null default 'ninguno'
                      check (reembolso in ('efectivo','ninguno')),
  caja_id           text references caja(id), -- caja de HOY donde salio el efectivo (si aplica)
  total             numeric not null default 0,
  usuario_id        text,
  usuario_nombre    text,
  created_at        timestamptz not null default now()
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

-- ------------------------------------------------------------
-- Verificacion rapida (opcional, correr aparte):
--   select proname from pg_proc where proname = 'registrar_devolucion_kiosko';
