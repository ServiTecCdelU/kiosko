-- ============================================================
-- Kiosko Despensa — Anulacion de ventas + Movimientos de caja
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO
-- (despues de 01..08). Es NO destructivo.
--
-- Incluye:
--   A) VENTAS: estado 'completada'|'anulada' + RPC anular_venta_kiosko
--      - Nunca borra la venta (trazabilidad fiscal/auditoria).
--      - Devuelve el stock con movimiento tipo 'devolucion'.
--      - Si era fiado, revierte el saldo del cliente.
--   B) CAJA: tabla caja_movimientos (retiros/aportes/gastos)
--      - El arqueo pasa a ser:
--        apertura + ventas_efectivo + aportes - retiros - gastos
-- ============================================================

-- ============================================================
-- A) ANULACION DE VENTAS
-- ============================================================

-- A.1 — Estado y trazabilidad de la anulacion en `ventas`
alter table ventas add column if not exists estado            text not null default 'completada';
alter table ventas add column if not exists anulada_at        timestamptz;
alter table ventas add column if not exists anulada_por       text;
alter table ventas add column if not exists anulada_por_nombre text;
alter table ventas add column if not exists motivo_anulacion  text;

alter table ventas drop constraint if exists ventas_estado_check;
alter table ventas add constraint ventas_estado_check
  check (estado in ('completada','anulada'));

-- Filtrar ventas vigentes (resumen de caja, reportes) sin escanear las anuladas.
create index if not exists idx_ventas_estado on ventas (estado) where estado = 'completada';

-- A.2 — Nuevo tipo de movimiento de stock: 'devolucion' (entrada por anulacion)
alter table stock_movimientos drop constraint if exists stock_movimientos_tipo_check;
alter table stock_movimientos add constraint stock_movimientos_tipo_check
  check (tipo in ('venta','entrada','ajuste','sync','rotura','devolucion'));

-- A.3 — RPC: anular_venta_kiosko
-- Revierte una venta de forma ATOMICA.
-- Devuelve: { id, sale_number, total, items_devueltos }
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
         -v_venta.total, v_saldo_actual, v_saldo_nuevo, v_venta.id,
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
-- B) MOVIMIENTOS DE CAJA (retiros / aportes / gastos)
-- ============================================================

-- B.1 — Tabla de movimientos de efectivo que NO son ventas
--   tipo = 'retiro' -> sale efectivo del cajon (pago a proveedor, retiro del dueno)
--   tipo = 'aporte' -> entra efectivo al cajon (cambio, reposicion)
--   tipo = 'gasto'  -> sale efectivo como gasto operativo (se reporta aparte)
create table if not exists caja_movimientos (
  id           text primary key,
  comercio_id  text not null references comercios(id) on delete cascade,
  caja_id      text not null references caja(id) on delete cascade,
  tipo         text not null check (tipo in ('retiro','aporte','gasto')),
  monto        numeric not null check (monto > 0),
  concepto     text not null default '',
  usuario_id   text,
  usuario_nombre text,
  fecha        timestamptz not null default now()
);

create index if not exists idx_cajamov_caja on caja_movimientos (caja_id);
create index if not exists idx_cajamov_comercio_fecha on caja_movimientos (comercio_id, fecha desc);

-- B.2 — Totales acumulados en el cierre de caja (para el historial de arqueos)
alter table caja add column if not exists total_retiros numeric not null default 0;
alter table caja add column if not exists total_aportes numeric not null default 0;
alter table caja add column if not exists total_gastos  numeric not null default 0;

-- B.3 — RPC: registrar_movimiento_caja
-- Valida que la caja este abierta y pertenezca al comercio antes de insertar.
-- Devuelve: { id, tipo, monto }
create or replace function registrar_movimiento_caja(
  p_caja_id        text,
  p_comercio_id    text,
  p_tipo           text,
  p_monto          numeric,
  p_concepto       text default '',
  p_usuario_id     text default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
as $$
declare
  v_id text;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if p_tipo not in ('retiro','aporte','gasto') then
    raise exception 'Tipo de movimiento invalido: %', p_tipo;
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if not exists (
    select 1 from caja
    where id = p_caja_id and estado = 'abierta' and comercio_id = p_comercio_id
  ) then
    raise exception 'La caja % no esta abierta', p_caja_id;
  end if;

  v_id := gen_random_uuid()::text;

  insert into caja_movimientos
    (id, comercio_id, caja_id, tipo, monto, concepto, usuario_id, usuario_nombre, fecha)
  values
    (v_id, p_comercio_id, p_caja_id, p_tipo, p_monto, coalesce(p_concepto, ''),
     p_usuario_id, p_usuario_nombre, now());

  return jsonb_build_object('id', v_id, 'tipo', p_tipo, 'monto', p_monto);
end;
$$;

-- B.4 — RLS desactivado, en linea con 04_rls_off.sql
alter table caja_movimientos disable row level security;
