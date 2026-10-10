-- 46_vencimientos_por_lote.sql
-- Un producto puede tener varios lotes con fechas de vencimiento distintas
-- (tres partidas de yogur). productos.fecha_vencimiento sigue siendo "la mas
-- proxima" para que los avisos de Stock e Inicio no cambien; los lotes la
-- alimentan. Un lote entra con la compra (fecha opcional por item) o a mano.
-- Spec: docs/superpowers/specs/2026-10-10-vencimientos-por-lote-design.md
-- Correr DESPUES de 44 (redefine anular_compra_kiosko y recibir_compra_kiosko).
-- No destructivo y re-ejecutable.

create table if not exists producto_lotes (
  id                text primary key,
  comercio_id       text not null references comercios(id),
  producto_id       text not null references productos(id) on delete cascade,
  fecha_vencimiento date not null,
  cantidad          numeric not null default 0 check (cantidad >= 0),
  compra_id         text,                -- de que compra entro (si entro por compra)
  nota              text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists idx_producto_lotes_producto on producto_lotes (comercio_id, producto_id) where activo;
create index if not exists idx_producto_lotes_fecha on producto_lotes (comercio_id, fecha_vencimiento) where activo;

-- productos.fecha_vencimiento = el lote activo mas proximo. Si el producto tuvo
-- lotes y ya no le queda ninguno activo, se limpia (ya no hay nada por vencer).
-- Un producto sin lotes conserva la fecha cargada a mano.
create or replace function sincronizar_vencimiento_producto(
  p_comercio_id text,
  p_producto_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min date;
begin
  select min(fecha_vencimiento) into v_min
  from producto_lotes
  where comercio_id = p_comercio_id and producto_id = p_producto_id and activo;

  if v_min is not null then
    update productos set fecha_vencimiento = v_min
      where id = p_producto_id and comercio_id = p_comercio_id;
  elsif exists (
    select 1 from producto_lotes
    where comercio_id = p_comercio_id and producto_id = p_producto_id
  ) then
    update productos set fecha_vencimiento = null
      where id = p_producto_id and comercio_id = p_comercio_id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- recibir_compra_kiosko: misma firma; cada item puede traer
-- "fechaVencimiento" (YYYY-MM-DD) y se crea el lote.
-- ------------------------------------------------------------
create or replace function recibir_compra_kiosko(
  p_comercio_id    text,
  p_proveedor_id   text,
  p_items          jsonb,   -- [{productoId, cantidad, costoUnitario, fechaVencimiento?}]
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
  v_vence     date;
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
    begin
      v_vence := nullif(trim(v_item->>'fechaVencimiento'), '')::date;
    exception when others then
      raise exception 'Fecha de vencimiento invalida en un item';
    end;

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
      (gen_random_uuid()::text, p_comercio_id, v_producto.id, 'entrada', v_cantidad,
       v_producto.stock, v_producto.stock + v_cantidad,
       v_compra_id, p_usuario_nombre, now());

    if v_vence is not null then
      insert into producto_lotes (id, comercio_id, producto_id, fecha_vencimiento, cantidad, compra_id)
      values (gen_random_uuid()::text, p_comercio_id, v_producto.id, v_vence, v_cantidad, v_compra_id);
      perform sincronizar_vencimiento_producto(p_comercio_id, v_producto.id);
    end if;

    v_total := v_total + v_cantidad * v_costo;
    v_n_items := v_n_items + 1;
  end loop;

  update compras
    set total = v_total,
        pagado = case when p_pagada then v_total else 0 end
    where id = v_compra_id;

  return jsonb_build_object('compraId', v_compra_id, 'total', v_total, 'items', v_n_items);
end;
$$;

-- ------------------------------------------------------------
-- anular_compra_kiosko: igual que en 44, mas la baja de los lotes que
-- entraron con la compra.
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
  v_lote   record;
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
  if coalesce(v_compra.pagado, 0) > 0.009 then
    raise exception 'La compra tiene pagos registrados ($%). Anula primero esos pagos en Cuenta corriente.',
      round(v_compra.pagado, 2);
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
        (gen_random_uuid()::text, p_comercio_id, v_item.producto_id, 'ajuste', -v_item.cantidad,
         v_stock, v_stock - v_item.cantidad,
         'anulacion ' || p_compra_id, p_usuario_id, now());
    end if;
  end loop;

  for v_lote in
    select producto_id from producto_lotes
    where compra_id = p_compra_id and comercio_id = p_comercio_id and activo
  loop
    update producto_lotes set activo = false
      where compra_id = p_compra_id and comercio_id = p_comercio_id and producto_id = v_lote.producto_id;
    perform sincronizar_vencimiento_producto(p_comercio_id, v_lote.producto_id);
  end loop;

  update compras
    set estado = 'anulada', anulada_at = now(), anulada_por = p_usuario_id
    where id = p_compra_id;
end;
$$;
