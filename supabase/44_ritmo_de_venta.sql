-- 44_ritmo_de_venta.sql — datos para la seccion "Pedí más: se vende bien" del Stock.
-- Por producto del comercio: lo vendido en los ultimos p_dias, lo vendido en los
-- p_dias anteriores (para ver si se acelero) y la ultima compra recibida de los
-- ultimos 60 dias con cuanto se vendio desde entonces.
-- Solo lectura: no crea tablas ni columnas. Re-ejecutable.

create or replace function productos_ritmo_venta(
  p_comercio_id text,
  p_dias        integer default 14
) returns table (
  producto_id            text,
  nombre                 text,
  unidad                 text,
  stock_actual           numeric,
  stock_minimo           numeric,
  vendido_reciente       numeric,
  vendido_anterior       numeric,
  ultima_compra_fecha    timestamptz,
  ultima_compra_cantidad numeric,
  vendido_desde_compra   numeric
)
language sql
stable
as $$
  with items as (
    select (item->>'productId') as pid, (item->>'quantity')::numeric as q, v.created_at
    from ventas v
    cross join lateral jsonb_array_elements(v.items) as item
    where v.comercio_id = p_comercio_id
      and v.estado = 'completada'
      and v.created_at >= now() - make_interval(days => greatest(p_dias * 2, 60))
  ),
  -- Una compra puede traer el mismo producto en dos renglones: se suman
  por_compra as (
    select ci.producto_id as pid, c.id as compra_id, c.created_at as fecha, sum(ci.cantidad) as cantidad
    from compra_items ci
    join compras c on c.id = ci.compra_id
    where ci.comercio_id = p_comercio_id
      and c.comercio_id = p_comercio_id
      and c.estado = 'recibida'
      and c.created_at >= now() - interval '60 days'
    group by 1, 2, 3
  ),
  ultima as (
    select distinct on (pid) pid, fecha, cantidad
    from por_compra
    order by pid, fecha desc
  ),
  agg as (
    select i.pid,
      sum(i.q) filter (where i.created_at >= now() - make_interval(days => p_dias)) as reciente,
      sum(i.q) filter (where i.created_at <  now() - make_interval(days => p_dias)
                         and i.created_at >= now() - make_interval(days => p_dias * 2)) as anterior,
      sum(i.q) filter (where u.fecha is not null and i.created_at >= u.fecha) as desde_compra
    from items i
    left join ultima u on u.pid = i.pid
    group by i.pid
  )
  select
    p.id,
    p.name,
    p.unidad,
    p.stock,
    p.stock_minimo,
    coalesce(a.reciente, 0),
    coalesce(a.anterior, 0),
    u.fecha,
    u.cantidad,
    coalesce(a.desde_compra, 0)
  from agg a
  join productos p on p.id = a.pid and p.comercio_id = p_comercio_id
  left join ultima u on u.pid = a.pid
  where not p.disabled
    and coalesce(a.reciente, 0) > 0;
$$;
