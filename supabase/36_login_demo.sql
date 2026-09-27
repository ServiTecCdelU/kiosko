-- 36_login_demo.sql
-- Acceso a la demo desde el login (boton "Acceso a demo", PIN publico 1234).
--
-- verificar_pin (20_pin_hash.sql) busca el PIN en TODOS los comercios y
-- devuelve el primero: con un PIN publicado en pantalla, eso podria abrir un
-- comercio real que casualmente use el mismo PIN. Esta funcion verifica solo
-- dentro de UN comercio; la usa /api/auth/demo con el comercio de slug 'demo'.
-- No destructivo.

create or replace function verificar_pin_comercio(p_comercio_id text, p_pin text)
returns table (id text, nombre text, rol text, comercio_id text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    select u.id, u.nombre, u.rol, u.comercio_id
      from usuarios u
      where u.comercio_id = p_comercio_id
        and u.activo = true
        and u.pin_hash is not null
        and u.pin_hash = crypt(p_pin, u.pin_hash)
      limit 1;
end;
$$;

-- Solo el server (service role) la llama, igual que verificar_pin.
revoke all on function verificar_pin_comercio(text, text) from anon, authenticated;

-- Usuario de la demo: admin (para mostrar todo el sistema) con PIN 1234.
-- El correo es ficticio: nadie entra a la demo con Google.
select crear_empleado_kiosko(
  (select id from comercios where slug = 'demo'),
  'Demo', 'admin',
  p_email := 'demo@demo.local',
  p_pin := '1234'
);

-- ------------------------------------------------------------
-- CHEQUEO (correr aparte): ningun usuario de un comercio REAL deberia usar
-- el PIN publico de la demo. Si da mas de 0, cambiale el PIN a ese empleado
-- desde Empleados: el login con 1234 ahora siempre entra a la demo.
--   select u.comercio_id, u.nombre, u.rol
--     from usuarios u
--     where u.comercio_id <> (select id from comercios where slug = 'demo')
--       and u.pin_hash is not null
--       and u.pin_hash = extensions.crypt('1234', u.pin_hash);
-- ------------------------------------------------------------
