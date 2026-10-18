-- 70_anular_con_devoluciones.sql — no se anula una venta que ya tuvo devoluciones.
--
-- La anulacion devuelve todo el stock de la venta y revierte toda la parte fiada.
-- Si antes hubo una devolucion parcial, eso ya se habia devuelto: el stock quedaba
-- de mas y el cliente con la deuda descontada dos veces. Lo que falta se devuelve
-- con otra devolucion (que topea por lo ya devuelto).
--
-- Es la definicion que estaba en produccion el 2026-10-18 (pg_get_functiondef) con
-- solo ese chequeo agregado. Misma firma. Re-ejecutable.

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
