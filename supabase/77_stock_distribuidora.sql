-- ============================================================
-- 77 — Mover stock entre el comercio y la distribuidora (solo stock)
-- ============================================================
-- Spec: docs/superpowers/specs/2026-10-23-stock-distribuidora-design.md
--
-- Los productos son los del catalogo sincronizado (productos.dist_id = id del
-- producto en la distribuidora); cada lado tiene SU stock. Una transferencia
-- descuenta en el origen y suma en el destino, en dos bases distintas: queda
-- registrada aca con su estado para que, si algo se corta a mitad de camino,
-- se pueda reintentar sin duplicar (los dos lados son idempotentes por id).
--
-- No destructivo y re-ejecutable.

-- 1. Comercio vinculado a la distribuidora. Uno solo activo: ningun otro
--    comercio puede ver ni mover el stock de la distribuidora.
create table if not exists distribuidora_vinculo (
  comercio_id text primary key references comercios(id) on delete cascade,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists idx_distribuidora_vinculo_un_activo
  on distribuidora_vinculo ((true)) where activo;

-- 2. Transferencias
--    direccion: a_comercio (distribuidora -> comercio) | a_distribuidora (comercio -> distribuidora)
--    estado:    pendiente -> origen_ok (ya se desconto en el origen) -> completa
--               fallida = el origen no la acepto (ej. sin stock): no se movio nada
create table if not exists transferencias_distribuidora (
  id          text primary key,
  comercio_id text not null references comercios(id),
  producto_id text not null references productos(id),
  dist_id     text not null,
  cantidad    numeric not null check (cantidad > 0),
  direccion   text not null check (direccion in ('a_comercio', 'a_distribuidora')),
  estado      text not null default 'pendiente'
                check (estado in ('pendiente', 'origen_ok', 'completa', 'fallida')),
  pedida_en   text not null default 'comercio' check (pedida_en in ('comercio', 'distribuidora')),
  usuario     text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_transf_dist_comercio_fecha
  on transferencias_distribuidora (comercio_id, created_at desc);
create index if not exists idx_transf_dist_abiertas
  on transferencias_distribuidora (comercio_id) where estado in ('pendiente', 'origen_ok');

alter table distribuidora_vinculo enable row level security;
alter table transferencias_distribuidora enable row level security;
revoke all on table distribuidora_vinculo, transferencias_distribuidora from anon, authenticated;

-- 3. Nuevo tipo de movimiento de stock
alter table stock_movimientos drop constraint if exists stock_movimientos_tipo_check;
alter table stock_movimientos add constraint stock_movimientos_tipo_check
  check (tipo in ('venta', 'entrada', 'ajuste', 'sync', 'rotura', 'devolucion', 'transferencia'));

-- 4. Lado del comercio de una transferencia. Idempotente: si ya se aplico, no hace nada.
--    a_distribuidora: el comercio es el ORIGEN  -> resta, pendiente -> origen_ok
--    a_comercio:      el comercio es el DESTINO -> suma,  origen_ok -> completa
create or replace function aplicar_transferencia_comercio(
  p_transferencia_id text,
  p_comercio_id      text
) returns jsonb
language plpgsql
as $$
declare
  t        transferencias_distribuidora%rowtype;
  v_delta  numeric;
  v_sigue  text;
  v_actual numeric;
  v_nuevo  numeric;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;

  select * into t from transferencias_distribuidora
    where id = p_transferencia_id and comercio_id = p_comercio_id
    for update;
  if not found then
    raise exception 'La transferencia % no existe en este comercio', p_transferencia_id;
  end if;

  if t.direccion = 'a_distribuidora' then
    if t.estado <> 'pendiente' then
      return jsonb_build_object('estado', t.estado, 'repetida', true);
    end if;
    v_delta := -t.cantidad;
    v_sigue := 'origen_ok';
  else
    if t.estado = 'completa' then
      return jsonb_build_object('estado', t.estado, 'repetida', true);
    end if;
    if t.estado <> 'origen_ok' then
      raise exception 'La distribuidora todavia no desconto la transferencia %', p_transferencia_id;
    end if;
    v_delta := t.cantidad;
    v_sigue := 'completa';
  end if;

  select stock into v_actual from productos
    where id = t.producto_id and comercio_id = p_comercio_id and dist_id = t.dist_id
    for update;
  if not found then
    raise exception 'El producto % no existe en este comercio', t.producto_id;
  end if;

  v_nuevo := coalesce(v_actual, 0) + v_delta;
  if v_nuevo < 0 then
    raise exception 'Stock insuficiente en el comercio (hay %)', coalesce(v_actual, 0);
  end if;

  update productos set stock = v_nuevo, updated_at = now()
    where id = t.producto_id and comercio_id = p_comercio_id;

  insert into stock_movimientos
    (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario, fecha)
  values
    (gen_random_uuid()::text, p_comercio_id, t.producto_id, 'transferencia', v_delta, v_actual, v_nuevo,
     'transferencia:' || t.id, t.usuario, now());

  update transferencias_distribuidora set estado = v_sigue, error = null, updated_at = now()
    where id = t.id;

  return jsonb_build_object('estado', v_sigue, 'stock_anterior', v_actual, 'stock_nuevo', v_nuevo);
end;
$$;

revoke execute on function aplicar_transferencia_comercio(text, text) from public, anon, authenticated;

-- 5. Vincular Supermercado Patricia (correr aparte, con su id real):
--    select id, nombre, slug from comercios where nombre ilike '%patricia%';
--    insert into distribuidora_vinculo (comercio_id) values ('<id>') on conflict do nothing;
