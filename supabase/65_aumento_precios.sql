-- 65_aumento_precios.sql — aumento (o rebaja) de precios por % en un solo paso.
--
-- Ferreterias y almacenes actualizan por lista del proveedor: "todo Almacén +12%".
-- Antes habia que editar producto por producto o reimportar el Excel.
--
-- Misma formula que lib/aumento-precios.ts (la pantalla la usa para la vista previa):
--   nuevo = round(precio * (1 + pct/100), 2), y con redondeo, hacia arriba al multiplo.
-- Toca solo productos con precio > 0, sin precio libre y activos; con rubro, ese
-- rubro y sus subrubros ("Almacén" abarca "Almacén / Galletitas").
-- Cada cambio queda en producto_auditoria, igual que la edicion a mano.
--
-- No destructiva y re-ejecutable (solo crea la funcion).

create or replace function aumentar_precios(
  p_comercio_id    text,
  p_porcentaje     numeric,
  p_rubro          text default null,
  p_redondeo       numeric default 0,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
as $$
declare
  v_cantidad integer;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if p_porcentaje is null or p_porcentaje = 0 or p_porcentaje <= -90 or p_porcentaje > 500 then
    raise exception 'El porcentaje tiene que estar entre -90 y 500';
  end if;
  if coalesce(p_redondeo, 0) not in (0, 10, 50, 100) then
    raise exception 'Redondeo invalido';
  end if;

  with objetivo as (
    select
      id,
      price as anterior,
      case
        when coalesce(p_redondeo, 0) > 0
          then ceil(round(price * (1 + p_porcentaje / 100), 2) / p_redondeo) * p_redondeo
        else round(price * (1 + p_porcentaje / 100), 2)
      end as nuevo
    from productos
    where comercio_id = p_comercio_id
      and price > 0
      and coalesce(precio_libre, false) = false
      and coalesce(disabled, false) = false
      and (
        nullif(p_rubro, '') is null
        or category = p_rubro
        or left(category, length(p_rubro) + 3) = p_rubro || ' / '
      )
  ),
  actualizados as (
    update productos p
       set price = o.nuevo, updated_at = now()
      from objetivo o
     where p.id = o.id
       and p.comercio_id = p_comercio_id
       and o.nuevo <> o.anterior
    returning p.id, o.anterior, o.nuevo
  ),
  auditados as (
    insert into producto_auditoria (id, comercio_id, producto_id, campo, valor_anterior, valor_nuevo, usuario_nombre)
    select gen_random_uuid()::text, p_comercio_id, a.id, 'price', a.anterior::text, a.nuevo::text, p_usuario_nombre
      from actualizados a
    returning 1
  )
  select count(*) into v_cantidad from auditados;

  return jsonb_build_object('actualizados', v_cantidad);
end;
$$;
