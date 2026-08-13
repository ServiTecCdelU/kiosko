-- 19_signo_ajuste_cuenta.sql
-- Correccion 6 de AUDITORIA_PAGOS.md.
--
-- Al anular una venta fiada, anular_venta_kiosko guardaba el movimiento de
-- reversa con monto NEGATIVO, contra la convencion declarada en
-- 05_clientes_fiado.sql: "monto: siempre positivo; el signo lo determina el
-- tipo". La ficha del cliente lo renderizaba como "+" + monto, asi que una
-- reversa salia con doble signo (+-$1.500) y en color de cargo, como si fuera
-- deuda nueva.
--
-- Se guarda el monto en positivo. Los movimientos YA registrados en negativo
-- no se tocan: la ficha del cliente deduce el sentido comparando saldo_nuevo
-- contra saldo_anterior, asi que los viejos tambien se ven bien.

create or replace function anular_venta_kiosko(
  p_venta_id     text,
  p_comercio_id  text,
  p_usuario_id   text default null,
  p_usuario_nombre text default null,
  p_motivo       text default null
) returns jsonb
language plpgsql
as $$
declare
  v_venta         record;
  v_item          jsonb;
  v_producto_id   text;
  v_cantidad      numeric;
  v_stock_actual  numeric;
  v_nuevo_stock   numeric;
  v_saldo_actual  numeric;
  v_saldo_nuevo   numeric;
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

  -- 4. Si era fiado, revertir el saldo del cliente
  if v_venta.payment_method = 'fiado' and v_venta.cliente_id is not null then
    select saldo into v_saldo_actual
      from clientes
      where id = v_venta.cliente_id and comercio_id = p_comercio_id
      for update;

    if found then
      v_saldo_nuevo := v_saldo_actual - v_venta.total;

      update clientes
        set saldo = v_saldo_nuevo, updated_at = now()
        where id = v_venta.cliente_id;

      insert into cuenta_corriente_mov
        (id, comercio_id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo,
         venta_id, referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_venta.cliente_id, 'ajuste',
         v_venta.total, v_saldo_actual, v_saldo_nuevo, v_venta.id,
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
$$;

-- ============================================================
-- Correccion 8 de AUDITORIA_PAGOS.md: desglosar Mercado Pago
-- ============================================================
-- El arqueo agrupaba transferencia + Mercado Pago + tarjeta en un solo total,
-- asi que no se podia saber cuanto entro por MP sin abrir la app de MP.
-- Se guarda aparte al cerrar la caja. Las cajas ya cerradas quedan en 0: su
-- total_transferencia sigue conteniendo todo, como hasta ahora.
alter table caja add column if not exists total_mercadopago numeric not null default 0;
