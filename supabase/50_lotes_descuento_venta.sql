-- 50_lotes_descuento_venta.sql
-- Los lotes de vencimiento (46) se descuentan al vender: cada venta o merma
-- consume primero el lote que vence antes (FIFO por fecha), y una devolucion
-- o anulacion devuelve la cantidad al lote. Un lote que llega a cero se da de
-- baja solo y la fecha de vencimiento del producto pasa al siguiente lote.
--
-- Se engancha con un trigger en stock_movimientos, asi cubre todos los caminos
-- (POS, cola offline, webhook de Mercado Pago, anulacion, devolucion, merma)
-- sin tocar process_sale_kiosko. Solo actua si el producto tiene lotes con
-- cantidad: los lotes cargados sin cantidad (solo fecha) siguen siendo
-- informativos y nunca se tocan.
-- Spec: docs/superpowers/specs/2026-10-10-vencimientos-por-lote-design.md
-- No destructivo y re-ejecutable. Correr despues de la 46.

-- Cuando se agoto por ventas (distinto de "dado de baja" a mano): una
-- devolucion lo puede reactivar.
alter table producto_lotes add column if not exists agotado_at timestamptz;

create or replace function lotes_por_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote    record;
  v_resta   numeric;
  v_tocado  boolean := false;
begin
  -- Salida de mercaderia: venta o merma.
  if new.tipo in ('venta', 'rotura') and new.cantidad < 0 then
    v_resta := -new.cantidad;
    for v_lote in
      select id, cantidad from producto_lotes
      where comercio_id = new.comercio_id and producto_id = new.producto_id
        and activo and cantidad > 0
      order by fecha_vencimiento asc, created_at asc
      for update
    loop
      exit when v_resta <= 0;
      v_tocado := true;
      if v_lote.cantidad > v_resta then
        update producto_lotes set cantidad = cantidad - v_resta where id = v_lote.id;
        v_resta := 0;
      else
        v_resta := v_resta - v_lote.cantidad;
        update producto_lotes set cantidad = 0, activo = false, agotado_at = now() where id = v_lote.id;
      end if;
    end loop;
    -- Lo que no entro en ningun lote (stock sin lote) no se registra: el lote es
    -- informativo de lo que entro con fecha.

  -- Vuelve mercaderia: anulacion o devolucion de una venta.
  elsif new.tipo = 'devolucion' and new.cantidad > 0 then
    -- Primero al lote activo que vence antes; si no hay, se reactiva el ultimo
    -- que se agoto vendiendo.
    select id into v_lote from producto_lotes
      where comercio_id = new.comercio_id and producto_id = new.producto_id and activo and cantidad > 0
      order by fecha_vencimiento asc, created_at asc
      limit 1 for update;
    if found then
      update producto_lotes set cantidad = cantidad + new.cantidad where id = v_lote.id;
      v_tocado := true;
    else
      select id into v_lote from producto_lotes
        where comercio_id = new.comercio_id and producto_id = new.producto_id
          and not activo and agotado_at is not null
        order by agotado_at desc
        limit 1 for update;
      if found then
        update producto_lotes set cantidad = new.cantidad, activo = true, agotado_at = null where id = v_lote.id;
        v_tocado := true;
      end if;
    end if;
  end if;

  if v_tocado then
    perform sincronizar_vencimiento_producto(new.comercio_id, new.producto_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lotes_por_movimiento on stock_movimientos;
create trigger trg_lotes_por_movimiento
  after insert on stock_movimientos
  for each row
  execute function lotes_por_movimiento();
