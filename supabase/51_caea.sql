-- 51_caea.sql
-- CAEA (Codigo de Autorizacion Electronico Anticipado): contingencia de la
-- facturacion electronica. AFIP da un codigo por quincena de antemano; si al
-- facturar AFIP no responde, el comprobante sale con el CAEA y despues se
-- informa (FECAEARegInformativo) antes de la fecha tope.
-- Spec: docs/superpowers/specs/2026-10-10-caea-design.md
-- No destructivo y re-ejecutable.

-- El comercio elige usar contingencia (por defecto no, para no cambiar nada).
alter table afip_config add column if not exists caea_activo boolean not null default false;

-- CAEAs obtenidos, uno por quincena (orden 1 = dias 1-15, orden 2 = 16-fin).
create table if not exists afip_caea (
  id           text primary key,
  comercio_id  text not null references comercios(id) on delete cascade,
  ambiente     text not null check (ambiente in ('homologacion', 'produccion')),
  periodo      text not null check (periodo ~ '^[0-9]{6}$'),   -- 'YYYYMM'
  orden        integer not null check (orden in (1, 2)),
  caea         text not null,
  vig_desde    date not null,
  vig_hasta    date not null,
  fch_tope_inf date not null,                                   -- hasta cuando se puede informar
  created_at   timestamptz not null default now(),
  unique (comercio_id, ambiente, periodo, orden)
);
alter table afip_caea enable row level security;

-- Comprobantes emitidos con CAEA: el codigo, y si ya se informaron a AFIP.
alter table facturas add column if not exists tipo_autorizacion text not null default 'CAE';
alter table facturas drop constraint if exists facturas_tipo_autorizacion_check;
alter table facturas add constraint facturas_tipo_autorizacion_check check (tipo_autorizacion in ('CAE', 'CAEA'));
alter table facturas add column if not exists caea           text;
alter table facturas add column if not exists caea_informada boolean not null default false;
alter table facturas add column if not exists caea_error     text;

create index if not exists idx_facturas_caea_pendientes
  on facturas (comercio_id) where tipo_autorizacion = 'CAEA' and not caea_informada and estado = 'autorizada';
