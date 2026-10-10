-- 49_billing_suscripcion.sql
-- Billing de la suscripcion del SaaS: precio por plan, pagos (Mercado Pago de la
-- plataforma o manuales) y extension de comercios.suscripcion_hasta.
-- Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
-- No destructivo y re-ejecutable. Correr ANTES de deployar el codigo que lo usa.

-- ------------------------------------------------------------
-- 1. Planes con precio. Precio 0 = no se cobra ni se bloquea (el superadmin
--    carga los precios reales desde su panel).
-- ------------------------------------------------------------
create table if not exists saas_planes (
  plan           text primary key check (plan in ('free', 'basico', 'pro')),
  nombre         text not null,
  precio_mensual numeric not null default 0 check (precio_mensual >= 0),
  descripcion    text,
  updated_at     timestamptz not null default now()
);
insert into saas_planes (plan, nombre, precio_mensual, descripcion) values
  ('free',   'Free',   0, 'Sin cargo'),
  ('basico', 'Básico', 0, 'Punto de venta, stock, caja, clientes y reportes'),
  ('pro',    'Pro',    0, 'Todo lo del Básico más facturación electrónica y multi-caja')
on conflict (plan) do nothing;

-- ------------------------------------------------------------
-- 2. Pagos de suscripcion. Un pago cubre UN mes (periodo 'YYYY-MM').
-- ------------------------------------------------------------
create table if not exists saas_pagos (
  id               text primary key,
  comercio_id      text not null references comercios(id) on delete cascade,
  plan             text not null,
  monto            numeric not null check (monto >= 0),
  periodo          text not null,                 -- mes que paga, 'YYYY-MM'
  metodo           text not null check (metodo in ('mercadopago', 'manual')),
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'aprobado', 'rechazado')),
  mp_preference_id text,
  mp_payment_id    text,
  nota             text,
  usuario_nombre   text,                           -- quien lo registro (manual: el superadmin)
  created_at       timestamptz not null default now(),
  aprobado_at      timestamptz
);
create index if not exists idx_saas_pagos_comercio on saas_pagos (comercio_id, created_at desc);
-- Un mismo pago de Mercado Pago no se aplica dos veces (el webhook avisa varias veces).
create unique index if not exists idx_saas_pagos_mp_payment on saas_pagos (mp_payment_id) where mp_payment_id is not null;

-- ------------------------------------------------------------
-- 3. Normalizar lo que guardaba "marcar pago" hasta hoy: ponia el dia 10 del
--    ciclo (23:59:59 hora argentina). Ahora suscripcion_hasta es "pagado hasta
--    fin de ese mes", asi la gracia arranca el 1 y el bloqueo el 11.
--    Idempotente: despues de convertir, el dia es 28-31 y no vuelve a entrar.
-- ------------------------------------------------------------
update comercios
set suscripcion_hasta =
  ((date_trunc('month', suscripcion_hasta at time zone 'America/Argentina/Buenos_Aires')
    + interval '1 month' - interval '1 second') at time zone 'America/Argentina/Buenos_Aires')
where suscripcion_hasta is not null
  and extract(day from (suscripcion_hasta at time zone 'America/Argentina/Buenos_Aires')) <= 10;

-- ------------------------------------------------------------
-- 4. Aplicar un pago aprobado: marca el pago y extiende la suscripcion un mes.
--    Si la suscripcion esta vencida o no existe, el mes que se paga es el
--    actual; si esta al dia, el siguiente. "Hasta" = fin de ese mes (hora
--    argentina). Un comercio en prueba pasa a activo. Idempotente por pago.
-- ------------------------------------------------------------
create or replace function aplicar_pago_saas(
  p_pago_id       text,
  p_mp_payment_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago     record;
  v_comercio record;
  v_base     timestamp;   -- hora argentina, sin zona
  v_hasta    timestamptz;
  v_periodo  text;
begin
  select * into v_pago from saas_pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago inexistente';
  end if;
  if v_pago.estado = 'aprobado' then
    select suscripcion_hasta into v_hasta from comercios where id = v_pago.comercio_id;
    return jsonb_build_object('ok', true, 'yaAplicado', true, 'periodo', v_pago.periodo, 'suscripcionHasta', v_hasta);
  end if;

  select * into v_comercio from comercios where id = v_pago.comercio_id for update;
  if not found then
    raise exception 'Comercio inexistente';
  end if;

  if v_comercio.suscripcion_hasta is null or v_comercio.suscripcion_hasta < now() then
    v_base := now() at time zone 'America/Argentina/Buenos_Aires';
  else
    v_base := (v_comercio.suscripcion_hasta at time zone 'America/Argentina/Buenos_Aires') + interval '1 day';
  end if;
  v_periodo := to_char(v_base, 'YYYY-MM');
  v_hasta := (date_trunc('month', v_base) + interval '1 month' - interval '1 second')
             at time zone 'America/Argentina/Buenos_Aires';

  update saas_pagos
    set estado = 'aprobado', aprobado_at = now(), periodo = v_periodo,
        mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id)
    where id = p_pago_id;

  update comercios
    set suscripcion_hasta = v_hasta,
        estado = case when estado = 'prueba' then 'activo' else estado end,
        plan = case when plan = 'free' and v_pago.plan in ('basico', 'pro') then v_pago.plan else plan end
    where id = v_pago.comercio_id;

  return jsonb_build_object('ok', true, 'yaAplicado', false, 'periodo', v_periodo, 'suscripcionHasta', v_hasta);
end;
$$;
