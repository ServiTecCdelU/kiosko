-- 56_saas_eventos.sql — historial de altas y cambios de estado/plan de cada
-- comercio, para el dashboard de metricas del superadmin (cuando pasan a Pro,
-- cuando se dan de baja, etc.). Hasta ahora `comercios` solo guardaba el
-- estado ACTUAL, sin fecha del cambio.
--
-- Re-ejecutable y no destructivo. Lo escribe un trigger: ninguna ruta de la
-- app inserta aca a mano.

create table if not exists saas_eventos (
  id          bigserial primary key,
  comercio_id text not null references comercios(id) on delete cascade,
  tipo        text not null check (tipo in ('alta', 'estado', 'plan')),
  de          text,              -- valor anterior (null en el alta)
  a           text not null,     -- valor nuevo; en el alta: origen ('autoregistro' | 'manual')
  created_at  timestamptz not null default now()
);
create index if not exists idx_saas_eventos_comercio on saas_eventos (comercio_id, created_at);
create index if not exists idx_saas_eventos_fecha on saas_eventos (created_at);
alter table saas_eventos enable row level security;

create or replace function saas_eventos_registrar() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into saas_eventos (comercio_id, tipo, de, a, created_at)
    values (new.id, 'alta', null, coalesce(new.config->>'origen', 'manual'), coalesce(new.created_at, now()));
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into saas_eventos (comercio_id, tipo, de, a) values (new.id, 'estado', old.estado, new.estado);
  end if;
  if new.plan is distinct from old.plan then
    insert into saas_eventos (comercio_id, tipo, de, a) values (new.id, 'plan', old.plan, new.plan);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_saas_eventos on comercios;
create trigger trg_saas_eventos
  after insert or update of estado, plan on comercios
  for each row execute function saas_eventos_registrar();

-- Backfill: el alta de los comercios que ya existian (con su fecha real).
-- Los cambios de estado/plan anteriores a esta migracion no tienen fecha
-- conocida, asi que no se inventan: el dashboard los muestra como "sin fecha".
insert into saas_eventos (comercio_id, tipo, de, a, created_at)
select c.id, 'alta', null, coalesce(c.config->>'origen', 'manual'), c.created_at
from comercios c
where not exists (select 1 from saas_eventos e where e.comercio_id = c.id and e.tipo = 'alta');
