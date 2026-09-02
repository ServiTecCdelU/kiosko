-- 25_usuarios_crud.sql
-- Funciones para dar de alta y editar usuarios (cajeros/admin) desde la
-- aplicacion, sin que el PIN en texto plano salga nunca de Postgres.
-- Mismo criterio que verificar_pin (20_pin_hash.sql): pgcrypto adentro de la
-- base, hash bcrypt, nunca se expone pin_hash.

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
  if p_rol not in ('admin', 'cajero') then
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
  if p_rol not in ('admin', 'cajero') then
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
