-- 27_proveedores_compras.sql
-- Proveedores y recepcion de mercaderia (compras) con costo por item.
-- Spec: docs/superpowers/specs/2026-09-18-proveedores-compras-design.md
-- No destructivo. Correr el archivo completo en el SQL Editor de Supabase.

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
  id              bigint generated always as identity primary key,
  compra_id       text not null references compras(id) on delete cascade,
  comercio_id     text not null references comercios(id),
  producto_id     text not null,
  producto_nombre text not null,              -- copia al momento (el catalogo cambia)
  cantidad        numeric not null check (cantidad > 0),
  costo_unitario  numeric not null check (costo_unitario >= 0),
  subtotal        numeric not null
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
      (gen_random_uuid()::text, p_comercio_id, v_producto.id, 'entrada', v_cantidad,
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
        (gen_random_uuid()::text, p_comercio_id, v_item.producto_id, 'ajuste', -v_item.cantidad,
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

-- ------------------------------------------------------------
-- Verificacion rapida (opcional, correr aparte):
--   select id, nombre from proveedores;
--   select proname from pg_proc where proname like '%compra%';
