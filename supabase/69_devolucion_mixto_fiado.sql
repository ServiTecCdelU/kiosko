-- 69_devolucion_mixto_fiado.sql — devolucion de una venta con parte fiada.
--
-- Antes la devolucion solo bajaba la deuda si la venta era 100% fiada: en un mixto
-- ("te dejo $1.000 y el resto anotamelo") se reembolsaba todo en efectivo aunque una
-- parte nunca se habia pagado. Ahora lo devuelto se descuenta primero de la deuda
-- (hasta lo que quedo fiado de esa venta, menos lo ya descontado en devoluciones
-- anteriores) y solo el resto se reembolsa.
--
-- devoluciones.a_cuenta: cuanto de la devolucion fue a la cuenta corriente. Caja y
-- reportes reparten con eso (lib/devoluciones-reporte.ts). Las devoluciones de antes
-- quedan en 0 (las de ventas 100% fiadas se reconocen por el medio de pago).
--
-- La funcion es la definicion que estaba en produccion el 2026-10-18
-- (pg_get_functiondef) con solo esos cambios. Misma firma. Re-ejecutable.

begin;

alter table devoluciones add column if not exists a_cuenta numeric not null default 0;

CREATE OR REPLACE FUNCTION public.registrar_devolucion_kiosko(p_comercio_id text, p_venta_id text, p_items jsonb, p_motivo text DEFAULT NULL::text, p_reembolso text DEFAULT 'ninguno'::text, p_caja_id text DEFAULT NULL::text, p_usuario_id text DEFAULT NULL::text, p_usuario_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venta          record;
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

    select id, name, stock into v_producto
      from productos
      where id = v_item->>'productoId' and comercio_id = p_comercio_id
      for update;

    if found then
      update productos
        set stock = stock + v_cantidad, updated_at = now()
        where id = v_producto.id and comercio_id = p_comercio_id;

      insert into stock_movimientos
        (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_producto.id, 'devolucion', v_cantidad,
         v_producto.stock, v_producto.stock + v_cantidad,
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
