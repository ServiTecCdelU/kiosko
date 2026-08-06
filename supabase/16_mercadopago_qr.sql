-- 16_mercadopago_qr.sql
-- Cobro con QR de Mercado Pago: la venta real (process_sale_kiosko) se dispara
-- recien cuando el webhook confirma el pago, no al mostrar el QR.

create table if not exists pagos_mp_pendientes (
  id                  text primary key,
  comercio_id         text not null references comercios(id) on delete cascade,
  external_reference  text not null unique,
  preference_id       text,
  payment_id          text,
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente','aprobado','rechazado','cancelado')),
  sale_input          jsonb not null,
  venta_id            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_mp_pendientes_ref on pagos_mp_pendientes (external_reference);
create index if not exists idx_mp_pendientes_comercio on pagos_mp_pendientes (comercio_id, created_at desc);

alter table pagos_mp_pendientes disable row level security;
