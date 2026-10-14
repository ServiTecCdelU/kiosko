-- 59_pin_6_en_rpc_empleados.sql
-- La app pasó a PIN de 6 números (43_cajas_y_dispositivos.sql, lib/pin.ts) pero
-- crear_empleado_kiosko / actualizar_empleado_kiosko seguían exigiendo 4:
-- crear un cajero, cambiarle el PIN o que el empleado eligiera el suyo
-- (/cambiar-pin) fallaba con "El PIN debe tener 4 digitos".
-- Las reglas finas (no obvios, no repetido en el comercio) siguen en el servidor.
-- El admin no usa PIN para entrar: no se valida (el usuario de la demo tiene 1234).
-- No destructivo y re-ejecutable.

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
    if p_pin is null or p_pin !~ '^[0-9]{6}$' then
      raise exception 'El PIN debe tener 6 numeros';
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
  if p_pin is not null and p_rol <> 'admin' and p_pin !~ '^[0-9]{6}$' then
    raise exception 'El PIN debe tener 6 numeros';
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

revoke all on function crear_empleado_kiosko(text, text, text, text, text, text) from anon, authenticated;
revoke all on function actualizar_empleado_kiosko(text, text, text, boolean, text, text, text) from anon, authenticated;
