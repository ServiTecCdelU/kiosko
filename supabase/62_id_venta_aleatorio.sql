-- 62_id_venta_aleatorio.sql — el id de venta deja de ser un contador global.
--
-- Antes: venta_<nextval(ventas_seq)>. Un comercio podia deducir cuantas ventas
-- hay en todo el SaaS mirando sus ids (CLAUDE.md pide ids con parte aleatoria).
-- El numero de ticket (sale_number) no cambia: sigue siendo por comercio.
--
-- Es la misma definicion que estaba en produccion el 2026-10-18 (copiada con
-- pg_get_functiondef) con solo esa linea cambiada. No destructiva y re-ejecutable.

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
  -- Id con parte aleatoria (62_id_venta_aleatorio.sql): con el contador global
  -- 'venta_337' cualquier comercio veia cuantas ventas hay en todo el sistema.
  v_sale_id     := 'venta_' || replace(gen_random_uuid()::text, '-', '');
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
