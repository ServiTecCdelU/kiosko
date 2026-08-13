-- 18_correcciones_pagos.sql
-- Tres correcciones criticas detectadas en la auditoria (ver AUDITORIA_PAGOS.md):
--   A) El constraint de payment_method no admitia los metodos de Mercado Pago.
--   B) El limite de credito del cliente no se validaba en ningun lado.
--   C) Un pago de MP aprobado cuya venta falla quedaba como 'pendiente' sin
--      dejar rastro del error (plata cobrada sin venta y sin aviso).

-- ============================================================
-- A) Metodos de pago realmente en uso
-- ============================================================
-- La app escribe 'mercadopago', 'mercadopago_point' y 'tarjeta', que no estaban
-- contemplados. Se mantiene 'qr' y 'tarjeta' por compatibilidad con ventas ya
-- registradas ('tarjeta' ya no se ofrece en el POS, pero existe en el historial).
alter table ventas drop constraint if exists ventas_payment_method_check;
alter table ventas add constraint ventas_payment_method_check
  check (payment_method in (
    'efectivo','transferencia','mixto','fiado','qr',
    'mercadopago','mercadopago_point','tarjeta'
  ));

-- ============================================================
-- C) Estado de error en los cobros de Mercado Pago
-- ============================================================
alter table pagos_mp_pendientes add column if not exists error_motivo text;

alter table pagos_mp_pendientes drop constraint if exists pagos_mp_pendientes_estado_check;
alter table pagos_mp_pendientes add constraint pagos_mp_pendientes_estado_check
  check (estado in ('pendiente','aprobado','rechazado','cancelado','error'));

-- ============================================================
-- B) process_sale_kiosko con validacion de limite de credito
-- ============================================================
-- Reemplaza la version de 15_servicio_sin_stock.sql. Unico cambio funcional:
-- en las ventas fiadas se bloquea el cliente y se valida el limite ANTES de
-- tocar stock, para no dejar la venta a medias.
-- limite_credito = 0 significa "sin limite" (comportamiento historico).
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
  v_controlado    boolean;
  v_sale_seq      bigint;
  v_sale_id       text;
  v_sale_number   text;
  v_saldo_actual  numeric;
  v_saldo_nuevo   numeric;
  v_limite        numeric;
  v_cliente_nom   text;
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

  -- 1b. Cliente valido, del comercio, y con credito suficiente si es fiado.
  --     Se bloquea la fila aca y se reusa el saldo en el paso 5: asi la
  --     validacion y el cargo son consistentes aunque haya ventas simultaneas.
  if p_payment_method = 'fiado' then
    if p_cliente_id is null then
      raise exception 'La venta fiada requiere un cliente';
    end if;

    select saldo, limite_credito, nombre
      into v_saldo_actual, v_limite, v_cliente_nom
      from clientes
      where id = p_cliente_id and activo = true and comercio_id = p_comercio_id
      for update;

    if not found then
      raise exception 'El cliente % no existe o no pertenece al comercio', p_cliente_id;
    end if;

    v_saldo_actual := coalesce(v_saldo_actual, 0);
    v_limite       := coalesce(v_limite, 0);

    -- limite 0 = sin limite
    if v_limite > 0 and (v_saldo_actual + p_total) > v_limite then
      raise exception
        'Limite de credito superado para "%": debe %, limite %, esta venta %',
        v_cliente_nom, v_saldo_actual, v_limite, p_total;
    end if;
  end if;

  -- 2. Identificadores de la venta
  v_sale_seq    := nextval('ventas_seq');
  v_sale_id     := 'venta_' || v_sale_seq;
  v_sale_number := lpad(v_sale_seq::text, 8, '0');

  -- 3. Validar y descontar stock (se saltea para "servicios" sin stock real)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := v_item->>'productId';
    v_cantidad    := coalesce((v_item->>'quantity')::numeric, 0);

    if v_cantidad <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_producto_id;
    end if;

    select stock, name, stock_controlado into v_stock_actual, v_nombre, v_controlado
      from productos
      where id = v_producto_id and comercio_id = p_comercio_id
      for update;

    if not found then
      raise exception 'El producto % no existe en este comercio', v_producto_id;
    end if;

    if v_controlado then
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
    end if;
  end loop;

  -- 4. Insertar la venta
  insert into ventas
    (id, comercio_id, sale_number, items, total, discount, payment_method,
     cash_amount, change_amount, transfer_amount, caja_id, user_id, user_name, cliente_id, created_at)
  values
    (v_sale_id, p_comercio_id, v_sale_number, p_items, p_total, coalesce(p_discount,0), p_payment_method,
     coalesce(p_cash_amount,0), coalesce(p_change_amount,0), coalesce(p_transfer_amount,0),
     p_caja_id, p_user_id, p_user_name, p_cliente_id, now());

  -- 5. Si es fiado, cargar la deuda (el cliente ya quedo bloqueado en 1b)
  if p_payment_method = 'fiado' then
    v_saldo_nuevo := v_saldo_actual + p_total;
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
