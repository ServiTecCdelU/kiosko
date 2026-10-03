-- 42_aislamiento_saas.sql
-- Auditoria SaaS (2026-10-03): que NINGUN dato de un comercio se pueda pisar,
-- mezclar o ver desde otro, aunque tengan datos iguales.
--
-- CORRER DESPUES DE DEPLOYAR EL CODIGO de este cambio: borra funciones viejas
-- (ej. verificar_pin) que el codigo anterior todavia usaba.
-- Re-ejecutable. No borra datos.

-- ------------------------------------------------------------
-- 1. Sin comercio por defecto. Ocho tablas tenian comercio_id DEFAULT
--    'comercio_1': un alta que se olvidara el comercio caia EN SILENCIO en
--    comercio_1. Sin default, ese alta falla y se nota.
-- ------------------------------------------------------------
alter table caja                 alter column comercio_id drop default;
alter table clientes             alter column comercio_id drop default;
alter table cuenta_corriente_mov alter column comercio_id drop default;
alter table productos            alter column comercio_id drop default;
alter table stock_movimientos    alter column comercio_id drop default;
alter table sync_log             alter column comercio_id drop default;
alter table usuarios             alter column comercio_id drop default;
alter table ventas               alter column comercio_id drop default;

-- ------------------------------------------------------------
-- 2. Funciones viejas SIN comercio. El codigo ya no las usa; quedaban
--    disponibles para un error futuro. La peor: verificar_pin(p_pin) buscaba
--    el PIN en TODOS los comercios (un cajero entraba a otro kiosko si
--    compartian PIN). Ahora el login usa verificar_pin_comercio.
-- ------------------------------------------------------------
drop function if exists verificar_pin(text);
drop function if exists process_sale_kiosko(jsonb, numeric, text, numeric, numeric, numeric, numeric, text, text, text);
drop function if exists process_sale_kiosko(jsonb, numeric, text, numeric, numeric, numeric, numeric, text, text, text, text);
drop function if exists process_sale_kiosko(jsonb, numeric, text, numeric, numeric, numeric, numeric, text, text, text, text, text);
drop function if exists ajustar_stock_kiosko(text, text, numeric, text, text);
drop function if exists registrar_pago_cuenta(text, numeric, text, text);
drop function if exists crear_usuario_pin(text, text, text, text);
drop function if exists actualizar_usuario(text, text, text, boolean, text);

-- ------------------------------------------------------------
-- 3. Numero de ticket POR COMERCIO. Salia de una secuencia unica de la
--    plataforma: los tickets de un kiosko saltaban (15, 42, 107...) y dejaban
--    ver cuanto vendian los demas. Cada comercio arranca donde estaba.
-- ------------------------------------------------------------
create table if not exists comercio_contadores (
  comercio_id text not null references comercios(id) on delete cascade,
  nombre      text not null,
  valor       bigint not null,
  primary key (comercio_id, nombre)
);
alter table comercio_contadores enable row level security;
revoke all on table comercio_contadores from anon, authenticated;

insert into comercio_contadores (comercio_id, nombre, valor)
select comercio_id, 'venta', max(sale_number::bigint)
from ventas
where sale_number ~ '^[0-9]+$'
group by comercio_id
on conflict (comercio_id, nombre) do nothing;

-- process_sale_kiosko: MISMA definicion que hoy esta en la base (copiada de
-- produccion el 2026-10-03), solo cambia de donde sale v_sale_number.
CREATE OR REPLACE FUNCTION public.process_sale_kiosko(p_items jsonb, p_total numeric, p_payment_method text, p_cash_amount numeric DEFAULT 0, p_change_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_caja_id text DEFAULT NULL::text, p_user_id text DEFAULT NULL::text, p_user_name text DEFAULT NULL::text, p_cliente_id text DEFAULT NULL::text, p_comercio_id text DEFAULT NULL::text, p_pagador_nombre text DEFAULT NULL::text, p_cuotas integer DEFAULT NULL::integer, p_recargo_pct numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
  v_numero_comercio bigint;
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
  -- Numero de ticket POR COMERCIO (42_aislamiento_saas.sql): cada kiosko
  -- numera sus ventas 1, 2, 3... El id sigue saliendo de ventas_seq (unico global).
  insert into comercio_contadores (comercio_id, nombre, valor)
  values (p_comercio_id, 'venta', 1)
  on conflict (comercio_id, nombre) do update set valor = comercio_contadores.valor + 1
  returning valor into v_numero_comercio;
  v_sale_number := lpad(v_numero_comercio::text, 8, '0');

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
$function$;

-- ------------------------------------------------------------
-- 4. p_comercio_id DEFAULT 'comercio_1' -> DEFAULT NULL. Un llamado sin
--    comercio caia en comercio_1; ahora corta con "Falta el comercio" (las
--    cuatro ya lo validan). Postgres no permite QUITAR el default de un
--    parametro que sigue a otros con default, pero si cambiarlo. Definiciones
--    copiadas de produccion (2026-10-03); solo cambia ese default.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ajustar_stock_kiosko(p_producto_id text, p_tipo text, p_cantidad numeric, p_usuario text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_comercio_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.canjear_puntos_kiosko(p_cliente_id text, p_puntos numeric, p_comercio_id text DEFAULT NULL::text, p_usuario text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pago_cuenta(p_cliente_id text, p_monto numeric, p_usuario text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_comercio_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$;
