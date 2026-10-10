-- 53_grupos_sucursales.sql
-- Sucursales del mismo dueño: un grupo con porcentaje de descuento. La sucursal
-- mas antigua del grupo paga completo; las demas pagan con el descuento sobre
-- plan + cajas extra. Lo arma el superadmin.
-- Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
-- No destructivo y re-ejecutable.

create table if not exists saas_grupos (
  id            text primary key,
  nombre        text not null,
  descuento_pct numeric not null default 0 check (descuento_pct >= 0 and descuento_pct <= 100),
  created_at    timestamptz not null default now()
);

alter table comercios add column if not exists grupo_id text references saas_grupos(id) on delete set null;
create index if not exists idx_comercios_grupo on comercios (grupo_id) where grupo_id is not null;

-- En cada pago queda el descuento que se aplico.
alter table saas_pagos add column if not exists descuento_pct numeric;
