-- 22_cerrar_anon_rls.sql
-- Fase 3 (final) del cierre de seguridad: el anon key deja de servir para algo.
--
-- ⚠️ CORRER ESTO SOLO DESPUES de que este deployado el codigo que mueve todas
-- las lecturas y escrituras a las API routes. Si se corre antes, la aplicacion
-- deja de funcionar.
--
-- Contexto: hasta ahora el navegador hablaba directo con PostgREST usando el
-- anon key, que viaja en el bundle. Con RLS desactivado y los permisos por
-- defecto de Supabase, esa clave daba lectura y escritura sobre todo.
--
-- Ahora la aplicacion solo entra por API routes con el service role, que
-- ignora RLS por diseño. Asi que se le puede sacar todo al rol anon.

-- ------------------------------------------------------------
-- 1. Revocar los permisos del rol anon (y de authenticated, que
--    tampoco se usa: no hay Supabase Auth en este proyecto)
-- ------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Que los objetos que se creen mas adelante tampoco les den permisos.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Activar RLS en todas las tablas del esquema public.
--    Sin politicas, nadie pasa salvo service_role, que la ignora.
--    Es la segunda barrera: aunque en el futuro alguien vuelva a
--    otorgar permisos al rol anon, RLS lo sigue frenando.
-- ------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Comprobacion
-- ------------------------------------------------------------
-- Deberia devolver 0 filas (ninguna tabla sin RLS):
--   select tablename from pg_tables t
--     where schemaname = 'public'
--       and not exists (
--         select 1 from pg_class c
--         join pg_namespace n on n.oid = c.relnamespace
--         where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity
--       );
--
-- Y esto tiene que fallar o venir vacio desde el navegador con el anon key:
--   curl "$SUPABASE_URL/rest/v1/ventas?select=id&limit=1" -H "apikey: $ANON_KEY"
