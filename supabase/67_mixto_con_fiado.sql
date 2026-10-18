-- 67_mixto_con_fiado.sql — pago mixto con una parte a fiado.
--
-- "Te dejo $5.000 y el resto anotamelo": el mixto ya combinaba efectivo,
-- transferencia, debito y credito; ahora una de las partes puede ir a la cuenta
-- corriente del cliente, con el mismo control de limite de credito que el fiado.
--
-- ventas.fiado_amount: parte de la venta que quedo fiada ('fiado' = el total).
--   El arqueo y los reportes la sacan de la plata cobrada (lib/arqueo.ts).
-- process_sale_kiosko: nuevo parametro p_fiado_monto (default 0: las llamadas de
--   antes siguen andando igual). Valida cliente y limite y carga la deuda en la
--   misma transaccion.
-- anular_venta_kiosko: revierte la parte fiada, no solo la venta 100% fiada.
--
-- Las dos funciones son las definiciones que estaban en produccion el 2026-10-18
-- (pg_get_functiondef) con solo esos cambios. Re-ejecutable.

begin;

alter table ventas add column if not exists fiado_amount numeric not null default 0;

-- Cambia la firma: se borra la vieja para que no queden dos con el mismo nombre.
drop function if exists process_sale_kiosko(jsonb, numeric, text, numeric, numeric, numeric, numeric, text, text, text, text, text, text, integer, numeric);

CREATE OR REPLACE FUNCTION public.process_sale_kiosko(p_items jsonb, p_total numeric, p_payment_method text, p_cash_amount numeric DEFAULT 0, p_change_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_caja_id text DEFAULT NULL::text, p_user_id text DEFAULT NULL::text, p_user_name text DEFAULT NULL::text, p_cliente_id text DEFAULT NULL::text, p_comercio_id text DEFAULT NULL::text, p_pagador_nombre text DEFAULT NULL::text, p_cuotas integer DEFAULT NULL::integer, p_recargo_pct numeric DEFAULT 0, p_fiado_monto numeric DEFAULT 0)
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
  v_fiado         numeric;
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
  -- Parte a fiado (67_mixto_con_fiado.sql): toda la venta si es 'fiado'; en un
  -- 'mixto', la porcion p_fiado_monto ("te dejo $5.000 y el resto anotamelo").
  v_fiado := case
    when p_payment_method = 'fiado' then p_total
    when p_payment_method = 'mixto' then least(greatest(coalesce(p_fiado_monto, 0), 0), p_total)
    else 0
  end;

  if v_fiado > 0 then
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
    if v_limite > 0 and (v_saldo_actual + v_fiado) > v_limite then
      raise exception
        'Limite de credito superado para "%": debe %, limite %, esta venta %',
        v_cliente_nom, v_saldo_actual, v_limite, v_fiado;
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
     pagador_nombre, cuotas, recargo_pct, fiado_amount, created_at)
  values
    (v_sale_id, p_comercio_id, v_sale_number, p_items, p_total, coalesce(p_discount,0), p_payment_method,
     coalesce(p_cash_amount,0), coalesce(p_change_amount,0), coalesce(p_transfer_amount,0),
     p_caja_id, p_user_id, p_user_name, p_cliente_id,
     p_pagador_nombre, p_cuotas, coalesce(p_recargo_pct,0), v_fiado, now());

  -- 5. Si hay parte fiada, cargar la deuda (el cliente ya quedo bloqueado en 1b)
  if v_fiado > 0 then
    v_saldo_nuevo := v_saldo_actual + v_fiado;
    update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = p_cliente_id;
    insert into cuenta_corriente_mov
      (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, venta_id, usuario, fecha)
    values
      (gen_random_uuid()::text, p_comercio_id, p_cliente_id, 'cargo', v_fiado, v_saldo_actual, v_saldo_nuevo, v_sale_id, p_user_name, now());
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

CREATE OR REPLACE FUNCTION public.anular_venta_kiosko(p_venta_id text, p_comercio_id text, p_usuario_id text DEFAULT NULL::text, p_usuario_nombre text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_venta         record;
  v_item          jsonb;
  v_producto_id   text;
  v_cantidad      numeric;
  v_stock_actual  numeric;
  v_nuevo_stock   numeric;
  v_saldo_actual  numeric;
  v_saldo_nuevo   numeric;
  v_fiado         numeric;
  v_devueltos     integer := 0;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;

  -- 1. Traer y bloquear la venta, acotada al comercio
  select * into v_venta
    from ventas
    where id = p_venta_id and comercio_id = p_comercio_id
    for update;

  if not found then
    raise exception 'La venta % no existe en este comercio', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta % ya fue anulada', p_venta_id;
  end if;

  -- 2. Si la venta pertenece a una caja, esa caja debe seguir abierta.
  --    (No se puede alterar un arqueo ya cerrado y firmado.)
  if v_venta.caja_id is not null then
    if not exists (
      select 1 from caja
      where id = v_venta.caja_id and estado = 'abierta' and comercio_id = p_comercio_id
    ) then
      raise exception 'No se puede anular: la caja de esta venta ya fue cerrada';
    end if;
  end if;

  -- 3. Devolver el stock de cada item
  for v_item in select * from jsonb_array_elements(v_venta.items)
  loop
    v_producto_id := v_item->>'productId';
    v_cantidad    := coalesce((v_item->>'quantity')::numeric, 0);
    if v_cantidad <= 0 then
      continue;
    end if;

    select stock into v_stock_actual
      from productos
      where id = v_producto_id and comercio_id = p_comercio_id
      for update;

    -- Si el producto fue borrado del catalogo, se anula igual (no se pierde la venta),
    -- pero no hay stock que devolver.
    if not found then
      continue;
    end if;

    v_nuevo_stock := v_stock_actual + v_cantidad;

    update productos
      set stock = v_nuevo_stock, updated_at = now()
      where id = v_producto_id and comercio_id = p_comercio_id;

    insert into stock_movimientos
      (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
       referencia, usuario, fecha)
    values
      (gen_random_uuid()::text, p_comercio_id, v_producto_id, 'devolucion', v_cantidad,
       v_stock_actual, v_nuevo_stock,
       'Anulacion venta ' || coalesce(v_venta.sale_number, v_venta.id),
       p_usuario_nombre, now());

    v_devueltos := v_devueltos + 1;
  end loop;

  -- 4. Si tenia parte fiada, revertir esa parte del saldo del cliente
  --    (toda la venta si era 'fiado'; la porcion fiado_amount si era 'mixto').
  v_fiado := case when v_venta.payment_method = 'fiado' then v_venta.total else coalesce(v_venta.fiado_amount, 0) end;
  if v_fiado > 0 and v_venta.cliente_id is not null then
    select saldo into v_saldo_actual
      from clientes
      where id = v_venta.cliente_id and comercio_id = p_comercio_id
      for update;

    if found then
      v_saldo_nuevo := v_saldo_actual - v_fiado;

      update clientes
        set saldo = v_saldo_nuevo, updated_at = now()
        where id = v_venta.cliente_id;

      insert into cuenta_corriente_mov
        (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo,
         venta_id, referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_venta.cliente_id, 'ajuste',
         v_fiado, v_saldo_actual, v_saldo_nuevo, v_venta.id,
         'Anulacion venta ' || coalesce(v_venta.sale_number, v_venta.id),
         p_usuario_nombre, now());
    end if;
  end if;

  -- 5. Marcar la venta como anulada (nunca se borra)
  update ventas
    set estado             = 'anulada',
        anulada_at         = now(),
        anulada_por        = p_usuario_id,
        anulada_por_nombre = p_usuario_nombre,
        motivo_anulacion   = p_motivo
    where id = p_venta_id and comercio_id = p_comercio_id;

  return jsonb_build_object(
    'id', v_venta.id,
    'sale_number', v_venta.sale_number,
    'total', v_venta.total,
    'items_devueltos', v_devueltos
  );
end;
$function$;

commit;

notify pgrst, 'reload schema';
