-- 21_una_caja_abierta.sql
-- Impedir a nivel base que un comercio tenga dos cajas abiertas al mismo tiempo.
--
-- Hasta ahora esto solo se controlaba en la aplicacion, y un bug en esa
-- verificacion alcanzo para crear una segunda caja abierta. Con un indice
-- unico parcial, la base lo rechaza aunque la aplicacion se equivoque.

-- 1. Limpieza previa: el indice no se puede crear si ya hay duplicados.
--    Solo se borran cajas abiertas VACIAS (sin ventas y sin movimientos),
--    conservando siempre la mas antigua de cada comercio, que es la real.
--    Una caja con movimiento no se toca nunca: hay que resolverla a mano.
delete from caja c
where c.estado = 'abierta'
  and not exists (select 1 from ventas v            where v.caja_id = c.id)
  and not exists (select 1 from caja_movimientos m  where m.caja_id = c.id)
  and c.opened_at > (
    select min(c2.opened_at) from caja c2
    where c2.comercio_id = c.comercio_id and c2.estado = 'abierta'
  );

-- 2. Como maximo una caja abierta por comercio.
create unique index if not exists idx_caja_una_abierta_por_comercio
  on caja (comercio_id)
  where estado = 'abierta';

-- Si el paso 2 falla por duplicados, quedaron dos cajas abiertas CON
-- movimiento. Para verlas:
--   select id, opened_at,
--          (select count(*) from ventas v where v.caja_id = caja.id) as ventas
--     from caja where estado = 'abierta' order by comercio_id, opened_at;
-- Hay que cerrar la que corresponda desde la aplicacion y volver a correr esto.
