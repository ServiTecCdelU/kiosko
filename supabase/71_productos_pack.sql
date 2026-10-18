-- 71_productos_pack.sql — producto "pack" de otro (oferta para la balanza).
--
-- Un combo "2 kg de banana x $3.000" no entra en la balanza Systel (un precio por kg).
-- Se carga como producto aparte, por unidad, "Banana oferta 2 kg" a $3.000, que la
-- balanza vende como cualquier unitario. pack_de / pack_cantidad dicen que cada
-- unidad son 2 kg de Banana: la venta descuenta 2 kg del stock de Banana, y la
-- anulacion y la devolucion los devuelven. El pack no tiene stock propio.
--
-- Las tres funciones son las definiciones que estaban en produccion el 2026-10-18
-- (pg_get_functiondef) con solo ese desvio agregado. Mismas firmas. Re-ejecutable.

begin;

alter table productos add column if not exists pack_de text references productos(id) on delete set null;
alter table productos add column if not exists pack_cantidad numeric;
do $$ begin
  alter table productos add constraint productos_pack_cantidad_positiva
    check (pack_cantidad is null or pack_cantidad > 0);
exception when duplicate_object then null; end $$;

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
  v_pack_de       text;
  v_pack_cant     numeric;
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

    -- Pack (71_productos_pack.sql): el stock que se mueve es el del producto base.
    select pack_de, pack_cantidad into v_pack_de, v_pack_cant
      from productos where id = v_producto_id and comercio_id = p_comercio_id;
    if v_pack_de is not null and coalesce(v_pack_cant, 0) > 0 then
      v_producto_id := v_pack_de;
      v_cantidad    := v_cantidad * v_pack_cant;
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
  v_pack_de       text;
  v_pack_cant     numeric;
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

  -- 1b. Con devoluciones no se anula (70_anular_con_devoluciones.sql): la anulacion
  --     devuelve TODO el stock y TODA la parte fiada, y lo ya devuelto se contaria
  --     dos veces. Lo que falta se devuelve con otra devolucion.
  if exists (select 1 from devoluciones where venta_id = p_venta_id and comercio_id = p_comercio_id) then
    raise exception 'La venta tiene devoluciones: no se puede anular. Devolvé lo que falta desde "Devolver"';
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

    -- Pack (71_productos_pack.sql): el stock que se mueve es el del producto base.
    select pack_de, pack_cantidad into v_pack_de, v_pack_cant
      from productos where id = v_producto_id and comercio_id = p_comercio_id;
    if v_pack_de is not null and coalesce(v_pack_cant, 0) > 0 then
      v_producto_id := v_pack_de;
      v_cantidad    := v_cantidad * v_pack_cant;
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

CREATE OR REPLACE FUNCTION public.registrar_devolucion_kiosko(p_comercio_id text, p_venta_id text, p_items jsonb, p_motivo text DEFAULT NULL::text, p_reembolso text DEFAULT 'ninguno'::text, p_caja_id text DEFAULT NULL::text, p_usuario_id text DEFAULT NULL::text, p_usuario_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venta          record;
  v_stock_id       text;
  v_stock_cant     numeric;
  v_pack_de        text;
  v_pack_cant      numeric;
  v_devolucion_id  text := 'devol_' || to_char(now(), 'YYYYMMDD') || '_' ||
                           substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_item           jsonb;
  v_venta_item     jsonb;
  v_producto       record;
  v_cantidad       numeric;
  v_ya_devuelto    numeric;
  v_precio         numeric;
  v_total          numeric := 0;
  v_saldo_actual   numeric;
  v_saldo_nuevo    numeric;
  v_fiado_venta    numeric;
  v_fiado_ya       numeric;
  v_a_cuenta       numeric := 0;
  v_reembolsado    numeric;
begin
  if p_reembolso not in ('efectivo','ninguno') then
    raise exception 'Reembolso invalido';
  end if;

  select * into v_venta from ventas
  where id = p_venta_id and comercio_id = p_comercio_id
  for update;
  if not found then
    raise exception 'La venta % no existe en este comercio', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya esta anulada, no se puede devolver';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La devolucion no tiene items';
  end if;

  if p_reembolso = 'efectivo' then
    if p_caja_id is null then
      raise exception 'Falta indicar la caja de hoy para el reembolso en efectivo';
    end if;
    if not exists (
      select 1 from caja where id = p_caja_id and estado = 'abierta' and comercio_id = p_comercio_id
    ) then
      raise exception 'La caja indicada para el reembolso no esta abierta';
    end if;
  end if;

  insert into devoluciones (id, comercio_id, venta_id, venta_sale_number, motivo,
                            reembolso, caja_id, total, usuario_id, usuario_nombre)
  values (v_devolucion_id, p_comercio_id, p_venta_id, v_venta.sale_number, p_motivo,
          p_reembolso, p_caja_id, 0, p_usuario_id, p_usuario_nombre);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad invalida en un item';
    end if;

    -- Item tal como esta en la venta original (para el precio y validar tope)
    select * into v_venta_item
      from jsonb_array_elements(v_venta.items) x
      where x->>'productId' = v_item->>'productoId'
      limit 1;
    if v_venta_item is null then
      raise exception 'El producto % no esta en la venta original', v_item->>'productoId';
    end if;
    v_precio := (v_venta_item->>'price')::numeric;

    select coalesce(sum(di.cantidad), 0) into v_ya_devuelto
      from devolucion_items di
      join devoluciones d on d.id = di.devolucion_id
      where d.venta_id = p_venta_id and di.producto_id = v_item->>'productoId';

    if v_ya_devuelto + v_cantidad > (v_venta_item->>'quantity')::numeric then
      raise exception 'No se puede devolver mas de lo vendido para %', v_item->>'productoId';
    end if;

    -- Pack (71_productos_pack.sql): el stock que vuelve es el del producto base.
    v_stock_id   := v_item->>'productoId';
    v_stock_cant := v_cantidad;
    select pack_de, pack_cantidad into v_pack_de, v_pack_cant
      from productos where id = v_stock_id and comercio_id = p_comercio_id;
    if v_pack_de is not null and coalesce(v_pack_cant, 0) > 0 then
      v_stock_id   := v_pack_de;
      v_stock_cant := v_cantidad * v_pack_cant;
    end if;

    select id, name, stock into v_producto
      from productos
      where id = v_stock_id and comercio_id = p_comercio_id
      for update;

    if found then
      update productos
        set stock = stock + v_stock_cant, updated_at = now()
        where id = v_producto.id and comercio_id = p_comercio_id;

      insert into stock_movimientos
        (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_producto.id, 'devolucion', v_stock_cant,
         v_producto.stock, v_producto.stock + v_stock_cant,
         'Devolucion venta ' || coalesce(v_venta.sale_number, v_venta.id), p_usuario_nombre, now());
    end if;
    -- Producto borrado del catalogo: se registra la devolucion igual, sin stock que sumar.

    insert into devolucion_items (devolucion_id, comercio_id, producto_id, producto_nombre,
                                  cantidad, precio_unitario, subtotal)
    values (v_devolucion_id, p_comercio_id, v_item->>'productoId',
            coalesce(v_venta_item->>'name', v_item->>'productoId'),
            v_cantidad, v_precio, v_cantidad * v_precio);

    v_total := v_total + v_cantidad * v_precio;
  end loop;

  -- Parte fiada (69_devolucion_mixto_fiado.sql): lo devuelto se descuenta primero de
  -- la deuda, hasta lo que quedo fiado de esta venta y todavia no se desconto en
  -- devoluciones anteriores. Esa parte el cliente no la pago: no se le da plata.
  -- Toda la venta si era 'fiado'; fiado_amount si era un 'mixto'.
  v_fiado_venta := case when v_venta.payment_method = 'fiado' then v_venta.total
                        else coalesce(v_venta.fiado_amount, 0) end;
  if v_fiado_venta > 0 and v_venta.cliente_id is not null then
    select coalesce(sum(-monto), 0) into v_fiado_ya
      from cuenta_corriente_mov
      where comercio_id = p_comercio_id and venta_id = p_venta_id
        and tipo = 'ajuste' and referencia like 'Devolucion venta %';
    v_a_cuenta := least(v_total, greatest(v_fiado_venta - v_fiado_ya, 0));
  end if;
  v_reembolsado := v_total - v_a_cuenta;

  update devoluciones set total = v_total, a_cuenta = v_a_cuenta where id = v_devolucion_id;

  -- Efectivo: sale del cajon de HOY como gasto (reutiliza caja_movimientos, sin tocar su esquema).
  -- Solo lo que no fue a la cuenta corriente.
  if p_reembolso = 'efectivo' and v_reembolsado > 0 then
    insert into caja_movimientos (id, comercio_id, caja_id, tipo, monto, concepto, usuario_id, usuario_nombre, fecha)
    values (gen_random_uuid()::text, p_comercio_id, p_caja_id, 'gasto', v_reembolsado,
            'Devolucion venta ' || coalesce(v_venta.sale_number, v_venta.id), p_usuario_id, p_usuario_nombre, now());
  end if;

  -- Fiado: se revierte el saldo del cliente por la parte que fue a la cuenta (no es efectivo fisico).
  if v_a_cuenta > 0 then
    select saldo into v_saldo_actual from clientes
      where id = v_venta.cliente_id and comercio_id = p_comercio_id
      for update;
    if found then
      v_saldo_nuevo := v_saldo_actual - v_a_cuenta;
      update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = v_venta.cliente_id;
      insert into cuenta_corriente_mov
        (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, venta_id, referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_venta.cliente_id, 'ajuste', -v_a_cuenta,
         v_saldo_actual, v_saldo_nuevo, v_venta.id,
         'Devolucion venta ' || coalesce(v_venta.sale_number, v_venta.id), p_usuario_nombre, now());
    end if;
  end if;

  return jsonb_build_object('devolucionId', v_devolucion_id, 'total', v_total,
                            'aCuenta', v_a_cuenta, 'reembolsado', v_reembolsado);
end;
$function$;

commit;

notify pgrst, 'reload schema';
