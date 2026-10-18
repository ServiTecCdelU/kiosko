-- 66_presupuestos.sql — presupuestos del mostrador (ferreteria y afines).
-- Diseño: docs/superpowers/specs/2026-10-18-presupuestos-design.md
--
-- Un presupuesto es un carrito guardado con precios que se respetan mientras esta
-- vigente. No reserva stock. "Vencido" no se guarda: es vigente con vence < hoy.
--
-- No destructiva y re-ejecutable.

create table if not exists presupuestos (
  id                text primary key,
  comercio_id       text not null references comercios(id),
  numero            bigint not null,
  cliente_id        text references clientes(id),
  cliente_nombre    text,
  items             jsonb not null,
  total             numeric not null check (total >= 0),
  validez_dias      integer not null check (validez_dias between 1 and 365),
  vence             date not null,
  estado            text not null default 'vigente' check (estado in ('vigente','vendido','anulado')),
  venta_id          text references ventas(id),
  notas             text,
  creado_por_nombre text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (comercio_id, numero)
);

create index if not exists idx_presupuestos_comercio_fecha on presupuestos (comercio_id, created_at desc);

-- El navegador no consulta la base directo (RLS cerrado, como el resto).
alter table presupuestos enable row level security;
revoke all on table presupuestos from anon, authenticated;

-- Numero por comercio (1, 2, 3...) y alta en una sola transaccion: dos mostradores
-- no pueden sacar el mismo numero. Los precios ya vienen calculados por el servidor
-- (app/api/presupuestos/route.ts), igual que en la venta.
create or replace function crear_presupuesto(
  p_comercio_id       text,
  p_id                text,
  p_cliente_id        text,
  p_cliente_nombre    text,
  p_items             jsonb,
  p_total             numeric,
  p_validez_dias      integer,
  p_vence             date,
  p_notas             text,
  p_creado_por_nombre text
) returns jsonb
language plpgsql
as $$
declare
  v_numero bigint;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El presupuesto no tiene productos';
  end if;
  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and comercio_id = p_comercio_id
  ) then
    raise exception 'El cliente no es de este comercio';
  end if;

  insert into comercio_contadores (comercio_id, nombre, valor)
  values (p_comercio_id, 'presupuesto', 1)
  on conflict (comercio_id, nombre) do update set valor = comercio_contadores.valor + 1
  returning valor into v_numero;

  insert into presupuestos
    (id, comercio_id, numero, cliente_id, cliente_nombre, items, total, validez_dias, vence, notas, creado_por_nombre)
  values
    (p_id, p_comercio_id, v_numero, p_cliente_id, nullif(trim(p_cliente_nombre), ''), p_items, p_total,
     p_validez_dias, p_vence, nullif(trim(p_notas), ''), p_creado_por_nombre);

  return jsonb_build_object('id', p_id, 'numero', v_numero);
end;
$$;

notify pgrst, 'reload schema';
