-- ============================================================
-- Kiosko Despensa — Fase: Clientes + Cuenta Corriente (fiado)
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO
-- (despues de 01_schema.sql).
-- ============================================================

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table if not exists clientes (
  id              text primary key,
  nombre          text not null,
  telefono        text,
  documento       text,
  limite_credito  numeric not null default 0,    -- 0 = sin limite
  saldo           numeric not null default 0,     -- deuda actual (positivo = debe)
  notas           text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_clientes_nombre on clientes (lower(nombre));
create index if not exists idx_clientes_activo on clientes (activo);

-- ------------------------------------------------------------
-- CUENTA_CORRIENTE_MOV — movimientos de fiado y pagos
--   tipo = 'cargo'  -> aumenta la deuda (venta fiada)
--   tipo = 'pago'   -> reduce la deuda (abono del cliente)
--   tipo = 'ajuste' -> correccion manual
-- monto: siempre positivo; el signo lo determina el tipo.
-- ------------------------------------------------------------
create table if not exists cuenta_corriente_mov (
  id             text primary key,
  cliente_id     text not null references clientes(id) on delete cascade,
  tipo           text not null check (tipo in ('cargo','pago','ajuste')),
  monto          numeric not null,
  saldo_anterior numeric,
  saldo_nuevo    numeric,
  venta_id       text references ventas(id) on delete set null,
  referencia     text,
  usuario        text,
  fecha          timestamptz not null default now()
);

create index if not exists idx_ccmov_cliente on cuenta_corriente_mov (cliente_id, fecha desc);

-- ------------------------------------------------------------
-- VENTAS — soportar venta fiada
-- ------------------------------------------------------------
alter table ventas add column if not exists cliente_id text references clientes(id) on delete set null;

-- Ampliar los medios de pago para incluir 'fiado'
alter table ventas drop constraint if exists ventas_payment_method_check;
alter table ventas add constraint ventas_payment_method_check
  check (payment_method in ('efectivo','transferencia','mixto','fiado'));

-- RLS off (consistente con el resto; no-op si nunca se activo)
alter table clientes              disable row level security;
alter table cuenta_corriente_mov  disable row level security;

-- ============================================================
-- RPC: process_sale_kiosko (REEMPLAZA la version de 01_schema.sql)
-- Agrega p_cliente_id y, si la venta es 'fiado', carga la deuda a
-- la cuenta corriente del cliente dentro de la MISMA transaccion.
-- ============================================================
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
  p_cliente_id      text    default null
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
  v_sale_seq      bigint;
  v_sale_id       text;
  v_sale_number   text;
  v_saldo_actual  numeric;
  v_saldo_nuevo   numeric;
begin
  -- 1. Validar que la caja este abierta (si se especifica)
  if p_caja_id is not null then
    if not exists (select 1 from caja where id = p_caja_id and estado = 'abierta') then
      raise exception 'La caja % no esta abierta', p_caja_id;
    end if;
  end if;

  -- 1b. Validar cliente si es venta fiada
  if p_payment_method = 'fiado' then
    if p_cliente_id is null then
      raise exception 'La venta fiada requiere un cliente';
    end if;
    if not exists (select 1 from clientes where id = p_cliente_id and activo = true) then
      raise exception 'El cliente % no existe o esta inactivo', p_cliente_id;
    end if;
  end if;

  -- 2. Generar identificadores de la venta
  v_sale_seq    := nextval('ventas_seq');
  v_sale_id     := 'venta_' || v_sale_seq;
  v_sale_number := lpad(v_sale_seq::text, 8, '0');

  -- 3. Validar y descontar stock de cada item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := v_item->>'productId';
    v_cantidad    := coalesce((v_item->>'quantity')::numeric, 0);

    if v_cantidad <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_producto_id;
    end if;

    select stock, name into v_stock_actual, v_nombre
      from productos where id = v_producto_id for update;

    if not found then
      raise exception 'El producto % no existe', v_producto_id;
    end if;
    if v_stock_actual < v_cantidad then
      raise exception 'Stock insuficiente para "%" (disponible %, solicitado %)',
        v_nombre, v_stock_actual, v_cantidad;
    end if;

    v_nuevo_stock := v_stock_actual - v_cantidad;

    update productos
      set stock = v_nuevo_stock, updated_at = now()
      where id = v_producto_id;

    insert into stock_movimientos
      (id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario, fecha)
    values
      (gen_random_uuid()::text, v_producto_id, 'venta', -v_cantidad,
       v_stock_actual, v_nuevo_stock, v_sale_id, p_user_name, now());
  end loop;

  -- 4. Insertar la venta
  insert into ventas
    (id, sale_number, items, total, discount, payment_method,
     cash_amount, change_amount, transfer_amount, caja_id, user_id, user_name, cliente_id, created_at)
  values
    (v_sale_id, v_sale_number, p_items, p_total, coalesce(p_discount,0), p_payment_method,
     coalesce(p_cash_amount,0), coalesce(p_change_amount,0), coalesce(p_transfer_amount,0),
     p_caja_id, p_user_id, p_user_name, p_cliente_id, now());

  -- 5. Si es fiado, cargar la deuda a la cuenta corriente del cliente
  if p_payment_method = 'fiado' then
    select saldo into v_saldo_actual from clientes where id = p_cliente_id for update;
    v_saldo_nuevo := coalesce(v_saldo_actual, 0) + p_total;
    update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = p_cliente_id;
    insert into cuenta_corriente_mov
      (id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, venta_id, usuario, fecha)
    values
      (gen_random_uuid()::text, p_cliente_id, 'cargo', p_total, v_saldo_actual, v_saldo_nuevo, v_sale_id, p_user_name, now());
  end if;

  return jsonb_build_object(
    'id', v_sale_id,
    'sale_number', v_sale_number,
    'total', p_total
  );
end;
$$;

-- ============================================================
-- RPC: registrar_pago_cuenta
-- Registra un abono del cliente (reduce la deuda) de forma atomica.
-- ============================================================
create or replace function registrar_pago_cuenta(
  p_cliente_id text,
  p_monto      numeric,
  p_usuario    text default null,
  p_referencia text default null
) returns jsonb
language plpgsql
as $$
declare
  v_saldo_actual numeric;
  v_saldo_nuevo  numeric;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;

  select saldo into v_saldo_actual from clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'El cliente % no existe', p_cliente_id;
  end if;

  v_saldo_nuevo := v_saldo_actual - p_monto;

  update clientes set saldo = v_saldo_nuevo, updated_at = now() where id = p_cliente_id;

  insert into cuenta_corriente_mov
    (id, cliente_id, tipo, monto, saldo_anterior, saldo_nuevo, referencia, usuario, fecha)
  values
    (gen_random_uuid()::text, p_cliente_id, 'pago', p_monto, v_saldo_actual, v_saldo_nuevo, p_referencia, p_usuario, now());

  return jsonb_build_object(
    'cliente_id', p_cliente_id,
    'saldo_anterior', v_saldo_actual,
    'saldo_nuevo', v_saldo_nuevo
  );
end;
$$;
