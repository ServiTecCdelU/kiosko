-- 45_inventario.sql
-- Recuento fisico de stock (inventario): se abre un recuento (de todo o de un
-- rubro), se cuenta gondola por gondola con el lector, y al cerrar el sistema
-- ajusta el stock de lo contado y deja el movimiento con referencia al recuento.
-- Spec: docs/superpowers/specs/2026-10-10-inventario-y-mermas-design.md
-- No destructivo y re-ejecutable.

create table if not exists inventarios (
  id               text primary key,
  comercio_id      text not null references comercios(id),
  nombre           text not null default '',
  categoria        text,                       -- null = todo el catalogo
  estado           text not null default 'abierto'
                     check (estado in ('abierto','cerrado','cancelado')),
  usuario_id       text,
  usuario_nombre   text,
  productos        integer not null default 0,  -- cuantos entraron al recuento
  contados         integer not null default 0,  -- cuantos se contaron (al cerrar)
  con_diferencia   integer not null default 0,
  diferencia_valor numeric not null default 0,  -- a costo: negativo = faltante
  created_at       timestamptz not null default now(),
  cerrado_at       timestamptz
);
create index if not exists idx_inventarios_comercio on inventarios (comercio_id, created_at desc);

create table if not exists inventario_items (
  id              bigint generated always as identity primary key,
  inventario_id   text not null references inventarios(id) on delete cascade,
  comercio_id     text not null references comercios(id),
  producto_id     text not null,
  producto_nombre text not null,
  codigo_barras   text,
  categoria       text,
  stock_sistema   numeric not null default 0,   -- stock al abrir el recuento
  contado         numeric,                      -- null = todavia no se conto
  contado_at      timestamptz,
  contado_por     text,
  stock_al_cerrar numeric,                      -- stock real al momento de cerrar
  diferencia      numeric,                      -- contado - stock_al_cerrar
  unique (inventario_id, producto_id)
);
create index if not exists idx_inventario_items_inv on inventario_items (inventario_id);

-- ------------------------------------------------------------
-- Abrir: toma una foto del catalogo (sin servicios ni dados de baja)
-- ------------------------------------------------------------
create or replace function abrir_inventario_kiosko(
  p_comercio_id    text,
  p_nombre         text default '',
  p_categoria      text default null,
  p_usuario_id     text default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := 'inv_' || to_char(now(), 'YYYYMMDD') || '_' ||
               substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_n  integer;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if exists (
    select 1 from inventarios
    where comercio_id = p_comercio_id and estado = 'abierto'
      and categoria is not distinct from nullif(trim(p_categoria), '')
  ) then
    raise exception 'Ya hay un recuento abierto para %',
      coalesce(nullif(trim(p_categoria), ''), 'todo el catalogo');
  end if;

  insert into inventarios (id, comercio_id, nombre, categoria, usuario_id, usuario_nombre)
  values (v_id, p_comercio_id, coalesce(p_nombre, ''), nullif(trim(p_categoria), ''),
          p_usuario_id, p_usuario_nombre);

  insert into inventario_items
    (inventario_id, comercio_id, producto_id, producto_nombre, codigo_barras, categoria, stock_sistema)
  select v_id, p_comercio_id, p.id, p.name, p.codigo_barras, p.category, p.stock
  from productos p
  where p.comercio_id = p_comercio_id
    and not p.disabled
    and p.stock_controlado
    and (nullif(trim(p_categoria), '') is null or p.category = trim(p_categoria));

  get diagnostics v_n = row_count;
  update inventarios set productos = v_n where id = v_id;

  return jsonb_build_object('inventarioId', v_id, 'productos', v_n);
end;
$$;

-- ------------------------------------------------------------
-- Contar un producto. Si no estaba en la foto (producto nuevo o de otro
-- rubro que aparecio en la gondola) se suma con su stock actual.
-- ------------------------------------------------------------
create or replace function contar_inventario_kiosko(
  p_inventario_id text,
  p_comercio_id   text,
  p_producto_id   text,
  p_contado       numeric,
  p_usuario       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod record;
  v_item record;
begin
  if p_contado is null or p_contado < 0 then
    raise exception 'La cantidad contada no puede ser negativa';
  end if;
  if not exists (
    select 1 from inventarios
    where id = p_inventario_id and comercio_id = p_comercio_id and estado = 'abierto'
  ) then
    raise exception 'El recuento no esta abierto';
  end if;

  select id, name, codigo_barras, category, stock into v_prod
  from productos where id = p_producto_id and comercio_id = p_comercio_id;
  if not found then
    raise exception 'Producto inexistente';
  end if;

  insert into inventario_items
    (inventario_id, comercio_id, producto_id, producto_nombre, codigo_barras, categoria,
     stock_sistema, contado, contado_at, contado_por)
  values
    (p_inventario_id, p_comercio_id, v_prod.id, v_prod.name, v_prod.codigo_barras, v_prod.category,
     v_prod.stock, p_contado, now(), p_usuario)
  on conflict (inventario_id, producto_id) do update
    set contado = excluded.contado, contado_at = now(), contado_por = excluded.contado_por
  returning * into v_item;

  return jsonb_build_object(
    'productoId', v_item.producto_id, 'nombre', v_item.producto_nombre,
    'stockSistema', v_item.stock_sistema, 'contado', v_item.contado
  );
end;
$$;

-- ------------------------------------------------------------
-- Cerrar: ajusta el stock de lo contado contra el stock REAL de ese momento
-- (pudo haber ventas mientras se contaba). Lo no contado no se toca.
-- ------------------------------------------------------------
create or replace function cerrar_inventario_kiosko(
  p_inventario_id  text,
  p_comercio_id    text,
  p_usuario_id     text default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv      record;
  v_item     record;
  v_stock    numeric;
  v_costo    numeric;
  v_dif      numeric;
  v_contados integer := 0;
  v_con_dif  integer := 0;
  v_valor    numeric := 0;
begin
  select * into v_inv from inventarios
  where id = p_inventario_id and comercio_id = p_comercio_id
  for update;
  if not found then
    raise exception 'Recuento inexistente';
  end if;
  if v_inv.estado <> 'abierto' then
    raise exception 'El recuento ya esta %', v_inv.estado;
  end if;

  for v_item in
    select * from inventario_items
    where inventario_id = p_inventario_id and contado is not null
    order by id
  loop
    select stock, coalesce(precio_base, 0) into v_stock, v_costo
    from productos
    where id = v_item.producto_id and comercio_id = p_comercio_id
    for update;
    if not found then
      continue;  -- producto borrado mientras se contaba
    end if;

    v_dif := v_item.contado - v_stock;
    v_contados := v_contados + 1;
    update inventario_items
      set stock_al_cerrar = v_stock, diferencia = v_dif
      where id = v_item.id;

    if v_dif <> 0 then
      v_con_dif := v_con_dif + 1;
      v_valor := v_valor + v_dif * v_costo;
      update productos
        set stock = v_item.contado, updated_at = now()
        where id = v_item.producto_id and comercio_id = p_comercio_id;
      insert into stock_movimientos
        (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_item.producto_id, 'ajuste', v_dif,
         v_stock, v_item.contado, 'inventario ' || p_inventario_id, p_usuario_nombre, now());
    end if;
  end loop;

  update inventarios
    set estado = 'cerrado', cerrado_at = now(),
        contados = v_contados, con_diferencia = v_con_dif, diferencia_valor = v_valor
    where id = p_inventario_id;

  return jsonb_build_object('contados', v_contados, 'conDiferencia', v_con_dif, 'diferenciaValor', v_valor);
end;
$$;
