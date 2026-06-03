-- ============================================================
-- Kiosko Despensa — Fase 1: Schema inicial
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO
-- (proyecto separado de la distribuidora).
-- ============================================================

-- Secuencia para numero de ticket correlativo
create sequence if not exists ventas_seq start 1;

-- ------------------------------------------------------------
-- PRODUCTOS
-- Espejo del catalogo sincronizado desde la distribuidora.
-- El STOCK es PROPIO del kiosko (la sync nunca lo pisa).
-- ------------------------------------------------------------
create table if not exists productos (
  id            text primary key,            -- mismo id que la distribuidora (mapeo de sync)
  codigo        text,                         -- codigo interno
  codigo_barras text,                         -- para escaneo con lector
  name          text not null default '',
  description   text default '',
  price         numeric not null default 0,   -- precio de venta al publico
  precio_base   numeric default 0,            -- costo (para calcular margen)
  category      text default '',
  image_url     text default '',
  stock         numeric not null default 0,   -- stock PROPIO del kiosko
  stock_minimo  numeric not null default 0,   -- umbral de alerta de stock bajo
  disabled      boolean not null default false,
  synced_at     timestamptz,                  -- ultima vez que la sync toco este producto
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_productos_codigo_barras on productos (codigo_barras);
create index if not exists idx_productos_codigo on productos (codigo);
create index if not exists idx_productos_name on productos (lower(name));
create index if not exists idx_productos_category on productos (category);

-- ------------------------------------------------------------
-- CAJA — sesion de caja diaria (apertura / cierre / arqueo)
-- ------------------------------------------------------------
create table if not exists caja (
  id                 text primary key,
  estado             text not null default 'abierta'      -- 'abierta' | 'cerrada'
                       check (estado in ('abierta','cerrada')),
  monto_apertura     numeric not null default 0,
  monto_cierre       numeric,                              -- efectivo contado al cerrar (arqueo)
  total_efectivo     numeric not null default 0,           -- ventas en efectivo (calculado al cerrar)
  total_transferencia numeric not null default 0,
  total_ventas       numeric not null default 0,
  cantidad_ventas    integer not null default 0,
  diferencia         numeric,                              -- arqueo - esperado
  abierta_por        text,
  abierta_por_nombre text,
  cerrada_por        text,
  notas              text,
  opened_at          timestamptz not null default now(),
  closed_at          timestamptz
);

create index if not exists idx_caja_estado on caja (estado) where estado = 'abierta';
create index if not exists idx_caja_opened_at on caja (opened_at desc);

-- ------------------------------------------------------------
-- VENTAS
-- ------------------------------------------------------------
create table if not exists ventas (
  id              text primary key,
  sale_number     text,                                   -- ticket correlativo (lpad 8)
  items           jsonb not null default '[]'::jsonb,     -- [{productId,name,quantity,price,subtotal}]
  total           numeric not null default 0,
  discount        numeric not null default 0,
  payment_method  text not null default 'efectivo'        -- 'efectivo' | 'transferencia' | 'mixto'
                    check (payment_method in ('efectivo','transferencia','mixto')),
  cash_amount     numeric not null default 0,             -- efectivo recibido
  change_amount   numeric not null default 0,             -- vuelto
  transfer_amount numeric not null default 0,
  caja_id         text references caja(id) on delete set null,
  user_id         text,                                   -- cajero (sin FK hasta Fase 7)
  user_name       text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ventas_caja_id on ventas (caja_id);
create index if not exists idx_ventas_created_at on ventas (created_at desc);

-- ------------------------------------------------------------
-- STOCK_MOVIMIENTOS — historial de movimientos de stock
-- cantidad: positiva = entrada, negativa = salida
-- ------------------------------------------------------------
create table if not exists stock_movimientos (
  id             text primary key,
  producto_id    text not null references productos(id) on delete cascade,
  tipo           text not null                            -- 'venta'|'entrada'|'ajuste'|'sync'|'rotura'
                   check (tipo in ('venta','entrada','ajuste','sync','rotura')),
  cantidad       numeric not null,
  stock_anterior numeric,
  stock_nuevo    numeric,
  referencia     text,                                    -- id de venta u observacion
  usuario        text,
  fecha          timestamptz not null default now()
);

create index if not exists idx_stockmov_producto on stock_movimientos (producto_id);
create index if not exists idx_stockmov_fecha on stock_movimientos (fecha desc);

-- ------------------------------------------------------------
-- SYNC_LOG — historial de sincronizaciones con la distribuidora
-- ------------------------------------------------------------
create table if not exists sync_log (
  id                     bigint generated always as identity primary key,
  estado                 text not null default 'ok'       -- 'ok' | 'error' | 'parcial'
                           check (estado in ('ok','error','parcial')),
  productos_creados      integer not null default 0,
  productos_actualizados integer not null default 0,
  productos_total        integer not null default 0,
  error                  text,
  started_at             timestamptz not null default now(),
  finished_at            timestamptz
);

create index if not exists idx_synclog_started on sync_log (started_at desc);

-- ------------------------------------------------------------
-- USUARIOS — cajeros / admin (se usa en Fase 7: auth)
-- ------------------------------------------------------------
create table if not exists usuarios (
  id         text primary key,
  nombre     text not null,
  pin        text,                                        -- Fase 7: guardar hash, no texto plano
  rol        text not null default 'cajero'
               check (rol in ('admin','cajero')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RPC: process_sale_kiosko
-- Registra una venta de forma ATOMICA: valida caja abierta,
-- valida y descuenta stock de cada item, registra movimientos
-- e inserta la venta. Todo en una transaccion.
-- Devuelve: { id, sale_number, total }
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
  p_user_name       text    default null
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
begin
  -- 1. Validar que la caja este abierta (si se especifica)
  if p_caja_id is not null then
    if not exists (select 1 from caja where id = p_caja_id and estado = 'abierta') then
      raise exception 'La caja % no esta abierta', p_caja_id;
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
     cash_amount, change_amount, transfer_amount, caja_id, user_id, user_name, created_at)
  values
    (v_sale_id, v_sale_number, p_items, p_total, coalesce(p_discount,0), p_payment_method,
     coalesce(p_cash_amount,0), coalesce(p_change_amount,0), coalesce(p_transfer_amount,0),
     p_caja_id, p_user_id, p_user_name, now());

  return jsonb_build_object(
    'id', v_sale_id,
    'sale_number', v_sale_number,
    'total', p_total
  );
end;
$$;

-- ============================================================
-- NOTA RLS: las tablas quedan SIN RLS (igual que la distribuidora).
-- Se accede con anon key (client) y service role (server).
-- Habilitar RLS + politicas queda pendiente para Fase 7 (auth).
-- ============================================================
