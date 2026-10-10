-- 54_debito_automatico.sql
-- Debito automatico de la suscripcion con Mercado Pago (API de suscripciones,
-- "preapproval"): el dueño autoriza una vez con su tarjeta y MP cobra cada mes.
-- Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
-- No destructivo y re-ejecutable.

create table if not exists saas_debitos (
  comercio_id     text primary key references comercios(id) on delete cascade,
  preapproval_id  text not null unique,
  estado          text not null default 'pending'
                    check (estado in ('pending', 'authorized', 'paused', 'cancelled')),
  monto           numeric not null check (monto >= 0),   -- lo que MP cobra por mes (se sincroniza)
  payer_email     text,
  init_point      text,                                   -- link para terminar de autorizar
  proximo_cobro   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelado_at    timestamptz
);
alter table saas_debitos enable row level security;

-- Cada cobro automatico queda en el historial con su suscripcion.
alter table saas_pagos add column if not exists mp_preapproval_id text;
