-- ============================================================
-- Kiosko Despensa — Fase 5: RPC de ajuste de stock
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO
-- (despues de 01_schema.sql).
-- ============================================================

-- Ajuste atomico de stock con registro de movimiento.
--   p_tipo = 'entrada' -> suma abs(p_cantidad)
--   p_tipo = 'rotura'  -> resta abs(p_cantidad)
--   p_tipo = 'ajuste'  -> setea el stock al valor absoluto p_cantidad
create or replace function ajustar_stock_kiosko(
  p_producto_id text,
  p_tipo        text,
  p_cantidad    numeric,
  p_usuario     text default null,
  p_referencia  text default null
) returns jsonb
language plpgsql
as $$
declare
  v_actual numeric;
  v_nuevo  numeric;
  v_delta  numeric;
begin
  select stock into v_actual from productos where id = p_producto_id for update;
  if not found then
    raise exception 'El producto % no existe', p_producto_id;
  end if;

  if p_tipo = 'ajuste' then
    v_nuevo := p_cantidad;
  elsif p_tipo = 'entrada' then
    v_nuevo := v_actual + abs(p_cantidad);
  elsif p_tipo = 'rotura' then
    v_nuevo := v_actual - abs(p_cantidad);
  else
    raise exception 'Tipo de movimiento invalido: %', p_tipo;
  end if;

  if v_nuevo < 0 then
    raise exception 'El stock no puede quedar negativo';
  end if;

  v_delta := v_nuevo - v_actual;

  update productos set stock = v_nuevo, updated_at = now() where id = p_producto_id;

  insert into stock_movimientos
    (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario, fecha)
  values
    (gen_random_uuid()::text, p_producto_id, p_tipo, v_delta, v_actual, v_nuevo, p_referencia, p_usuario, now());

  return jsonb_build_object('producto_id', p_producto_id, 'stock_anterior', v_actual, 'stock_nuevo', v_nuevo);
end;
$$;
