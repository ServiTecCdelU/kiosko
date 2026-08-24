-- 20_pin_hash.sql
-- Fase 1 del cierre de seguridad: los PIN dejan de estar en texto plano.
--
-- Por que importa: la tabla `usuarios` tiene RLS desactivado y el anon key
-- viaja en el bundle del navegador, asi que hoy cualquiera puede leer los PIN
-- y entrar como admin. Con el PIN hasheado, aunque lean la tabla no sirve.
--
-- La verificacion se hace DENTRO de Postgres (funcion verificar_pin): asi el
-- hash nunca sale de la base y no hace falta una libreria de bcrypt en Node.
--
-- Es idempotente: se puede correr mas de una vez sin romper nada.

-- En Supabase, pgcrypto suele quedar instalado en el schema "extensions"
-- (no en "public"), por eso la funcion de abajo agrega "extensions" al
-- search_path explicitamente.
create extension if not exists pgcrypto;

-- 1. Columna nueva con el hash
alter table usuarios add column if not exists pin_hash text;

-- 2. Hashear los PIN que todavia esten en texto plano.
--    bcrypt (gen_salt('bf')) con el costo por defecto.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'usuarios' and column_name = 'pin'
  ) then
    execute $mig$
      update usuarios
        set pin_hash = crypt(pin, gen_salt('bf'))
        where pin_hash is null and pin is not null
    $mig$;
  end if;
end $$;

-- 3. Verificacion del PIN. SECURITY DEFINER para que pueda leer la tabla
--    aunque el rol que la invoca no tenga permisos directos (asi sigue
--    funcionando cuando en la fase 3 se le revoquen los permisos a anon).
create or replace function verificar_pin(p_pin text)
returns table (id text, nombre text, rol text, comercio_id text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    select u.id, u.nombre, u.rol, u.comercio_id
      from usuarios u
      where u.activo = true
        and u.pin_hash is not null
        and u.pin_hash = crypt(p_pin, u.pin_hash)
      limit 1;
end;
$$;

-- 4. Recien ahora se borra el PIN en claro.
alter table usuarios drop column if exists pin;

-- Para dar de alta un usuario nuevo de aca en mas:
--   insert into usuarios (id, comercio_id, nombre, pin_hash, rol, activo)
--   values ('usuario_cajero_1', 'comercio_1', 'Cajero',
--           crypt('5678', gen_salt('bf')), 'cajero', true);
