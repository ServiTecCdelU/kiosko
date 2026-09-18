-- 26_multi_caja.sql
-- Multi-caja: puestos fisicos de cobro, una caja abierta por puesto y por
-- cajero, y rol intermedio "encargado".
-- Spec: docs/superpowers/specs/2026-09-18-multi-caja-design.md
-- No destructivo: add column / create if not exists; el backfill solo completa
-- valores null. Correr el archivo completo en el SQL Editor de Supabase.

-- ------------------------------------------------------------
-- 1. Puestos de cobro (el cajon fisico: Caja 1, Caja 2, ...)
-- ------------------------------------------------------------
create table if not exists puestos (
  id          text primary key,
  comercio_id text not null references comercios(id),
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (comercio_id, nombre)
);
create index if not exists idx_puestos_comercio on puestos (comercio_id) where activo;

-- ------------------------------------------------------------
-- 2. Cada caja (turno) pertenece a un puesto
-- ------------------------------------------------------------
alter table caja add column if not exists puesto_id text references puestos(id);

-- ------------------------------------------------------------
-- 3. Puesto inicial "Caja 1" por comercio existente + backfill del historial
-- ------------------------------------------------------------
insert into puestos (id, comercio_id, nombre)
select 'puesto_' || substr(md5(random()::text || c.id), 1, 12), c.id, 'Caja 1'
from comercios c
where not exists (select 1 from puestos p where p.comercio_id = c.id);

update caja set puesto_id = (
  select p.id from puestos p
  where p.comercio_id = caja.comercio_id
  order by p.created_at limit 1
)
where puesto_id is null;

-- ------------------------------------------------------------
-- 4. Restriccion nueva: una caja abierta POR PUESTO
--    (reemplaza a la de "una por comercio" de 21_una_caja_abierta.sql).
--    coalesce: si algun insert dejara puesto_id null, cae al comportamiento
--    anterior (una sola abierta por comercio) en vez de permitir infinitas.
-- ------------------------------------------------------------
drop index if exists idx_caja_una_abierta_por_comercio;
create unique index if not exists idx_caja_una_abierta_por_puesto
  on caja (comercio_id, coalesce(puesto_id, ''))
  where estado = 'abierta';

-- ------------------------------------------------------------
-- 5. Una caja abierta por cajero
-- ------------------------------------------------------------
create unique index if not exists idx_caja_una_abierta_por_cajero
  on caja (comercio_id, abierta_por)
  where estado = 'abierta' and abierta_por is not null;

-- ------------------------------------------------------------
-- 6. Rol "encargado": se re-declaran las funciones de 25_usuarios_crud.sql
--    ampliando la lista de roles admitidos. El resto del cuerpo no cambia.
-- ------------------------------------------------------------
create or replace function crear_usuario_pin(
  p_comercio_id text,
  p_nombre      text,
  p_pin         text,
  p_rol         text
) returns table (id text, nombre text, rol text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := 'usuario_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
begin
  if p_rol not in ('admin', 'encargado', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  insert into usuarios (id, comercio_id, nombre, pin_hash, rol, activo)
  values (v_id, p_comercio_id, trim(p_nombre), crypt(p_pin, gen_salt('bf')), p_rol, true);

  return query select v_id, trim(p_nombre), p_rol;
end;
$$;

create or replace function actualizar_usuario(
  p_id       text,
  p_nombre   text,
  p_rol      text,
  p_activo   boolean,
  p_pin      text default null  -- null = no cambiar el PIN
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_rol not in ('admin', 'encargado', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if not exists (select 1 from usuarios where id = p_id) then
    raise exception 'Usuario % no encontrado', p_id;
  end if;

  update usuarios
    set nombre = trim(p_nombre),
        rol = p_rol,
        activo = p_activo,
        pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else pin_hash end
    where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- Verificacion rapida (opcional, correr aparte):
--   select p.nombre, c.estado, c.abierta_por_nombre
--     from puestos p left join caja c on c.puesto_id = p.id and c.estado = 'abierta'
--    order by p.comercio_id, p.nombre;
