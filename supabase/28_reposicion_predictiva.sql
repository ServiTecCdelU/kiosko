-- 28_reposicion_predictiva.sql
-- RPC de reposicion sugerida: ritmo real de venta de cada producto en los
-- ultimos p_dias dias, proyectado sobre el stock actual.
--
-- Esta RPC ya la consume la app (app/api/consultas/productos/route.ts, accion
-- "reposicion"; UI en app/stock/page.tsx) y tiene tests en tests/db/reposicion.test.ts
-- — faltaba unicamente crearla en la base. No destructivo: solo crea la funcion.

create or replace function productos_reposicion_predictiva(
  p_comercio_id text,
  p_dias        integer default 14
) returns table (
  producto_id      text,
  nombre           text,
  stock_actual     numeric,
  stock_minimo     numeric,
  unidades_vendidas numeric,
  velocidad_diaria numeric,
  dias_restantes   numeric
)
language sql
stable
as $$
  with vendido as (
    select
      (item->>'productId') as producto_id,
      sum((item->>'quantity')::numeric) as unidades
    from ventas v
    cross join lateral jsonb_array_elements(v.items) as item
    where v.comercio_id = p_comercio_id
      and v.estado = 'completada'
      and v.created_at >= now() - (p_dias || ' days')::interval
    group by 1
  )
  select
    p.id as producto_id,
    p.name as nombre,
    p.stock as stock_actual,
    p.stock_minimo,
    vd.unidades as unidades_vendidas,
    (vd.unidades / p_dias::numeric) as velocidad_diaria,
    case when vd.unidades > 0
      then round(p.stock / (vd.unidades / p_dias::numeric), 1)
      else null
    end as dias_restantes
  from vendido vd
  join productos p
    on p.id = vd.producto_id and p.comercio_id = p_comercio_id
  where vd.unidades > 0
  order by dias_restantes asc nulls last;
$$;
