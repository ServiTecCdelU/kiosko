-- ============================================================
-- Kiosko Despensa — Fase 1: RPC multi-tenant
-- Ejecutar DESPUÉS de 06_multitenant.sql.
--
-- Reescribe las 3 RPC para recibir y validar p_comercio_id.
-- El parámetro va AL FINAL con default 'comercio_1', así las
-- llamadas viejas (sin el parámetro) siguen funcionando durante
-- el despliegue. Una vez actualizado el código, se puede quitar
-- el default (no es obligatorio).
-- ============================================================

-- ============================================================
-- process_sale_kiosko — venta atómica, ahora scopeada por comercio.
--   • Valida que la caja, los productos y el cliente pertenezcan
--     al comercio.
--   • Sella comercio_id en ventas, stock_movimientos y
--     cuenta_corriente_mov.
-- ============================================================
create or replace function process_sale_kiosko(
  p_items           jsonb,
  p_total           numeric,
  p_payment_method  text,
  p_cash_amount     numeric default 0,
  p_change_amount   numeric default 0,
  p_transfer_amount numeric default 0,
  p_discount        numeric default 0,
  p_caja_id         text    default null,
  p_user_id         text    default null,
  p_user_name       text    default null,
  p_cliente_id      text    default null,
  p_comercio_id     text    default 'comercio_1'
) returns jsonb
language plpgsql
as $$
declare
  v_item          jsonb;
  v_producto_id   text;
  v_cantidad      numeric;
  v_stock_actual  numeric;
  v_nuevo_stock   numeric;
  v_nombre        text;
  v_sale_seq      bigint;
  v_sale_id       text;
  v_sale_number   text;
  v_saldo_actual  numeric;
  v_saldo_nuevo   numeric;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;

  -- 1. La caja debe estar abierta y pertenecer al comercio
  if p_caja_id is not null then
    if not exists (
      select 1 from caja
      where id = p_caja_id and estado = 'abierta' and comercio_id = p_comercio_id
    ) then
      raise exception 'La caja % no esta abierta en este comercio', p_caja_id;
    end if;
  end if;

  -- 1b. Cliente válido y del comercio si es venta fiada
  if p_payment_method = 'fiado' then
    if p_cliente_id is null then
      raise exception 'La venta fiada requiere un cliente';
    end if;
    if not exists (
      select 1 from clientes
      where id = p_cliente_id and activo = true and comercio_id = p_comercio_id
    ) then
      raise exception 'El cliente % no existe o no pertenece al comercio', p_cliente_id;
    end if;
  end if;

  -- 2. Identificadores de la venta
  v_sale_seq    := nextval('ventas_seq');
  v_sale_id     := 'venta_' || v_sale_seq;
  v_sale_number := lpad(v_sale_seq::text, 8, '0');

  -- 3. Validar y descontar stock (productos del comercio)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := v_item->>'productId';
    v_cantidad    := coalesce((v_item->>'quantity')::numeric, 0);

    if v_cantidad <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_producto_id;
    end if;

    select stock, name into v_stock_actual, v_nombre
      from productos
      where id = v_producto_id and comercio_id = p_comercio_id
      for update;

    if not found then
      raise exception 'El producto % no existe en este comercio', v_producto_id;
    end if;
    if v_stock_actual < v_cantidad then
      raise exception 'Stock insuficiente para "%" (disponible %, solicitado %)',
        v_nombre, v_stock_actual, v_cantidad;
    end if;

    v_nuevo_stock := v_stock_actual - v_cantidad;

    update productos
      set stock = v_nuevo_stock, updated_at = now()
      where id = v_producto_id;

    insert into stock_movimientos
      (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario, fecha)
    values
      (gen_random_uuid()::text, p_comercio_id, v_producto_id, 'venta', -v_cantidad,
       v_stock_actual, v_nuevo_stock, v_sale_id, p_user_name, now());
  end loop;

  -- 4. Insertar la venta
  insert into ventas
    (id, comercio_id, sale_number, items, total, discount, payment_method,
     cash_amount, change_amount, transfer_amount, caja_id, user_id, user_name, cliente_id, created_at)
  values
    (v_sale_id, p_comercio_id, v_sale_number, p_items, p_total, coalesce(p_discount,0), p_payment_method,
     coalesce(p_cash_amount,0), coalesce(p_change_amount,0), coalesce(p_transfer_amount,0),
     p_caja_id, p_user_id, p_user_name, p_cliente_id, now());

  -- 5. Si es fiado, cargar la deuda a la cuenta corriente
  if p_payment_method = 'fiado' then
    select saldo into v_saldo_actual from clientes where id = p_cliente_id for update;
    v_saldo_nuevo := coalesce(v_saldo_actual, 0) + p_total;
    update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = p_cliente_id;
    insert into cuenta_corriente_mov
      (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, venta_id, usuario, fecha)
    values
      (gen_random_uuid()::text, p_comercio_id, p_cliente_id, 'cargo', p_total, v_saldo_actual, v_saldo_nuevo, v_sale_id, p_user_name, now());
  end if;

  return jsonb_build_object(
    'id', v_sale_id,
    'sale_number', v_sale_number,
    'total', p_total
  );
end;
$$;

-- ============================================================
-- ajustar_stock_kiosko — ahora valida que el producto sea del comercio
-- y sella comercio_id en el movimiento.
-- ============================================================
create or replace function ajustar_stock_kiosko(
  p_producto_id text,
  p_tipo        text,
  p_cantidad    numeric,
  p_usuario     text default null,
  p_referencia  text default null,
  p_comercio_id text default 'comercio_1'
) returns jsonb
language plpgsql
as $$
declare
  v_actual numeric;
  v_nuevo  numeric;
  v_delta  numeric;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;

  select stock into v_actual
    from productos
    where id = p_producto_id and comercio_id = p_comercio_id
    for update;
  if not found then
    raise exception 'El producto % no existe en este comercio', p_producto_id;
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
    (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario, fecha)
  values
    (gen_random_uuid()::text, p_comercio_id, p_producto_id, p_tipo, v_delta, v_actual, v_nuevo, p_referencia, p_usuario, now());

  return jsonb_build_object('producto_id', p_producto_id, 'stock_anterior', v_actual, 'stock_nuevo', v_nuevo);
end;
$$;

-- ============================================================
-- registrar_pago_cuenta — valida que el cliente sea del comercio
-- y sella comercio_id en el movimiento de pago.
-- ============================================================
create or replace function registrar_pago_cuenta(
  p_cliente_id text,
  p_monto      numeric,
  p_usuario    text default null,
  p_referencia text default null,
  p_comercio_id text default 'comercio_1'
) returns jsonb
language plpgsql
as $$
declare
  v_saldo_actual numeric;
  v_saldo_nuevo  numeric;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;

  select saldo into v_saldo_actual
    from clientes
    where id = p_cliente_id and comercio_id = p_comercio_id
    for update;
  if not found then
    raise exception 'El cliente % no existe en este comercio', p_cliente_id;
  end if;

  v_saldo_nuevo := v_saldo_actual - p_monto;

  update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = p_cliente_id;

  insert into cuenta_corriente_mov
    (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, referencia, usuario, fecha)
  values
    (gen_random_uuid()::text, p_comercio_id, p_cliente_id, 'pago', p_monto, v_saldo_actual, v_saldo_nuevo, p_referencia, p_usuario, now());

  return jsonb_build_object(
    'cliente_id', p_cliente_id,
    'saldo_anterior', v_saldo_actual,
    'saldo_nuevo', v_saldo_nuevo
  );
end;
$$;
