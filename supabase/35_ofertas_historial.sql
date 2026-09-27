-- 35_ofertas_historial.sql
-- Una fila por oferta terminada (finalizada, reemplazada por otra o limpiada al
-- vencer), con como vendio contra las 2 semanas previas. La escribe el server
-- (app/api/productos PUT) y alimenta el ranking "Que promos te funcionan".
-- RLS activada sin politicas: solo el service role (server) la lee y escribe.

create table if not exists ofertas_historial (
  id uuid primary key default gen_random_uuid(),
  comercio_id text not null,
  producto_id text not null,
  producto_nombre text not null,
  tipo text not null,
  valor numeric not null,
  cantidad integer,
  desde date,
  hasta date,
  finalizada_at timestamptz not null default now(),
  unidades_durante numeric,
  facturado_durante numeric,
  por_dia_antes numeric,
  por_dia_durante numeric,
  variacion_pct integer
);
create index if not exists ofertas_historial_comercio_idx
  on ofertas_historial (comercio_id, finalizada_at desc);
alter table ofertas_historial enable row level security;
