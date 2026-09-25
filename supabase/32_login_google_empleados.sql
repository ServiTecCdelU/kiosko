-- 32_login_google_empleados.sql
-- Admin por Google (Supabase Auth), cajero/encargado por PIN definido por el
-- admin. Pestana "Empleados": numero (contacto), correo (login de admin),
-- nombre, rol.
-- Spec: docs/superpowers/specs/2026-09-25-login-google-empleados-design.md
-- No destructivo. Correr el archivo completo en el SQL Editor de Supabase,
-- DESPUES de configurar el proveedor Google en Authentication > Providers
-- (ver seccion 2 del spec).

-- ------------------------------------------------------------
-- 1. BUG existente: el check de rol nunca incluyo 'encargado' (solo lo
--    validaban las funciones, no la tabla). En una base nueva esto rechaza
--    la creacion de encargados. Se corrige aca.
-- ------------------------------------------------------------
alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol in ('admin','encargado','cajero'));

-- ------------------------------------------------------------
-- 2. Columnas nuevas: correo (login de admin via Google) y telefono (contacto)
-- ------------------------------------------------------------
alter table usuarios add column if not exists email    text;
alter table usuarios add column if not exists telefono text;

-- Un mismo correo no puede repetirse dos veces en el mismo comercio.
create unique index if not exists idx_usuarios_email
  on usuarios (comercio_id, lower(email))
  where email is not null;

-- ------------------------------------------------------------
-- 3. crear_empleado_kiosko / actualizar_empleado_kiosko
--    Reemplazan a crear_usuario_pin / actualizar_usuario (25_usuarios_crud.sql):
--    - rol 'admin'              -> exige email, el pin es opcional (no se usa para entrar)
--    - rol 'cajero'/'encargado' -> exige pin de 4 digitos, el email es opcional
-- ------------------------------------------------------------
create or replace function crear_empleado_kiosko(
  p_comercio_id text,
  p_nombre      text,
  p_rol         text,
  p_email       text default null,
  p_telefono    text default null,
  p_pin         text default null
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
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if p_rol = 'admin' then
    if coalesce(trim(p_email), '') = '' then
      raise exception 'El administrador necesita un correo de Google';
    end if;
  else
    if p_pin !~ '^[0-9]{4}$' then
      raise exception 'El PIN debe tener 4 digitos';
    end if;
  end if;

  insert into usuarios (id, comercio_id, nombre, email, telefono, pin_hash, rol, activo)
  values (
    v_id, p_comercio_id, trim(p_nombre),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else null end,
    p_rol, true
  );

  return query select v_id, trim(p_nombre), p_rol;
end;
$$;

create or replace function actualizar_empleado_kiosko(
  p_id       text,
  p_nombre   text,
  p_rol      text,
  p_activo   boolean,
  p_email    text default null,   -- null = no cambiar
  p_telefono text default null,   -- null = no cambiar
  p_pin      text default null    -- null = no cambiar
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email_final text;
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

  select coalesce(nullif(trim(p_email), ''), email) into v_email_final
    from usuarios where id = p_id;

  if p_rol = 'admin' and coalesce(v_email_final, '') = '' then
    raise exception 'El administrador necesita un correo de Google';
  end if;

  update usuarios
    set nombre   = trim(p_nombre),
        rol      = p_rol,
        activo   = p_activo,
        email    = case when p_email is not null then nullif(trim(p_email), '') else email end,
        telefono = case when p_telefono is not null then nullif(trim(p_telefono), '') else telefono end,
        pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else pin_hash end
    where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- Una vez que tengas tu correo de Google decidido, crear el primer admin
-- real corriendo esta linea APARTE (reemplazar el email):
--   select crear_empleado_kiosko('comercio_1', 'Administrador', 'admin', p_email := 'tu-correo@gmail.com');
-- ------------------------------------------------------------
