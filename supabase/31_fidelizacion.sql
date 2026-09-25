-- 31_fidelizacion.sql
-- Programa de puntos por cliente. Item 4.4 del plan maestro.
-- Ejecutar en el SQL Editor de Supabase. No destructivo.
--
-- Regla: 1 punto cada $100 vendidos, en CUALQUIER venta que tenga un cliente
-- asociado (no solo fiado). Ajustar el divisor en process_sale_kiosko (paso 6,
-- mas abajo) si el comercio necesita otro ritmo.

-- ------------------------------------------------------------
-- 1. Saldo de puntos en el cliente
-- ------------------------------------------------------------
alter table clientes add column if not exists puntos numeric not null default 0;

-- ------------------------------------------------------------
-- 2. Historial de puntos (mismo criterio que cuenta_corriente_mov)
--    tipo = 'ganado' -> suma puntos (venta con cliente asociado)
--    tipo = 'canje'  -> resta puntos (el cliente los usa como descuento)
--    tipo = 'ajuste' -> correccion manual
-- ------------------------------------------------------------
create table if not exists puntos_mov (
  id             text primary key,
  comercio_id    text not null references comercios(id),
  cliente_id     text not null references clientes(id) on delete cascade,
  tipo           text not null check (tipo in ('ganado','canje','ajuste')),
  puntos         numeric not null,
  saldo_anterior numeric,
  saldo_nuevo    numeric,
  venta_id       text references ventas(id) on delete set null,
  referencia     text,
  usuario        text,
  fecha          timestamptz not null default now()
);
create index if not exists idx_puntosmov_cliente on puntos_mov (cliente_id, fecha desc);
alter table puntos_mov disable row level security;

-- ------------------------------------------------------------
-- 3. process_sale_kiosko (REEMPLAZA la version de 24_pago_con_recargo.sql)
--    Unico cambio funcional: paso 6, suma puntos si la venta tiene cliente_id
--    (cualquier medio de pago). El resto del cuerpo es identico.
-- ------------------------------------------------------------
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
  p_comercio_id     text    default 'comercio_1',
  p_pagador_nombre  text    default null,
  p_cuotas          integer default null,
  p_recargo_pct     numeric default 0
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
  v_puntos_ganados numeric;
  v_puntos_actual  numeric;
  v_puntos_nuevo   numeric;
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
     cash_amount, change_amount, transfer_amount, caja_id, user_id, user_name, cliente_id,
     pagador_nombre, cuotas, recargo_pct, created_at)
  values
    (v_sale_id, p_comercio_id, v_sale_number, p_items, p_total, coalesce(p_discount,0), p_payment_method,
     coalesce(p_cash_amount,0), coalesce(p_change_amount,0), coalesce(p_transfer_amount,0),
     p_caja_id, p_user_id, p_user_name, p_cliente_id,
     p_pagador_nombre, p_cuotas, coalesce(p_recargo_pct,0), now());

  -- 5. Si es fiado, cargar la deuda (el cliente ya quedo bloqueado en 1b)
  if p_payment_method = 'fiado' then
    v_saldo_nuevo := v_saldo_actual + p_total;
    update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = p_cliente_id;
    insert into cuenta_corriente_mov
      (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, venta_id, usuario, fecha)
    values
      (gen_random_uuid()::text, p_comercio_id, p_cliente_id, 'cargo', p_total, v_saldo_actual, v_saldo_nuevo, v_sale_id, p_user_name, now());
  end if;

  -- 6. Fidelizacion: si la venta tiene un cliente asociado (cualquier medio de
  --    pago), suma puntos. 1 punto cada $100 -- ajustar el divisor aca.
  if p_cliente_id is not null then
    v_puntos_ganados := floor(p_total / 100);
    if v_puntos_ganados > 0 then
      select puntos into v_puntos_actual
        from clientes
        where id = p_cliente_id and comercio_id = p_comercio_id
        for update;
      if found then
        v_puntos_actual := coalesce(v_puntos_actual, 0);
        v_puntos_nuevo := v_puntos_actual + v_puntos_ganados;
        update clientes set puntos = v_puntos_nuevo, updated_at = now() where id = p_cliente_id;
        insert into puntos_mov
          (id, comercio_id, cliente_id, tipo, puntos, saldo_anterior, saldo_nuevo, venta_id, usuario, fecha)
        values
          (gen_random_uuid()::text, p_comercio_id, p_cliente_id, 'ganado', v_puntos_ganados,
           v_puntos_actual, v_puntos_nuevo, v_sale_id, p_user_name, now());
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_sale_id,
    'sale_number', v_sale_number,
    'total', p_total
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. RPC de canje: el cajero descuenta puntos a cambio de un beneficio que
--    se aplica a mano (descuento en el POS, un regalo, etc). No mueve stock
--    ni caja: solo lleva la cuenta de puntos, igual criterio que
--    registrar_pago_cuenta con la deuda de fiado.
-- ------------------------------------------------------------
create or replace function canjear_puntos_kiosko(
  p_cliente_id  text,
  p_puntos      numeric,
  p_comercio_id text default 'comercio_1',
  p_usuario     text default null,
  p_motivo      text default null
) returns jsonb
language plpgsql
as $$
declare
  v_puntos_actual numeric;
  v_puntos_nuevo  numeric;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if p_puntos is null or p_puntos <= 0 then
    raise exception 'Los puntos a canjear deben ser mayor a cero';
  end if;

  select puntos into v_puntos_actual
    from clientes
    where id = p_cliente_id and comercio_id = p_comercio_id
    for update;
  if not found then
    raise exception 'El cliente % no existe en este comercio', p_cliente_id;
  end if;
  v_puntos_actual := coalesce(v_puntos_actual, 0);

  if p_puntos > v_puntos_actual then
    raise exception 'El cliente solo tiene % puntos disponibles', v_puntos_actual;
  end if;

  v_puntos_nuevo := v_puntos_actual - p_puntos;
  update clientes set puntos = v_puntos_nuevo, updated_at = now() where id = p_cliente_id;

  insert into puntos_mov
    (id, comercio_id, cliente_id, tipo, puntos, saldo_anterior, saldo_nuevo, referencia, usuario, fecha)
  values
    (gen_random_uuid()::text, p_comercio_id, p_cliente_id, 'canje', p_puntos, v_puntos_actual, v_puntos_nuevo, p_motivo, p_usuario, now());

  return jsonb_build_object(
    'cliente_id', p_cliente_id,
    'puntos_anterior', v_puntos_actual,
    'puntos_nuevo', v_puntos_nuevo
  );
end;
$$;
