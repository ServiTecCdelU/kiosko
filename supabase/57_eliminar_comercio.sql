-- 57_eliminar_comercio.sql — RPC para borrar un comercio con TODOS sus datos
-- desde el panel de superadmin (pruebas, altas equivocadas).
--
-- Muchas tablas referencian comercios(id) sin "on delete cascade" (26, 27, 29,
-- 31, 37, 44, 45, 46...) y ademas se referencian entre si. En vez de mantener
-- a mano una lista ordenada de tablas, la funcion recorre todas las tablas del
-- esquema public que tengan columna comercio_id y las borra en pasadas: si una
-- falla por una FK, se reintenta en la pasada siguiente, cuando ya se borro la
-- tabla hija. Devuelve cuantas filas borro por tabla.
--
-- Solo la llama la API del superadmin con la service key. Re-ejecutable.

create or replace function eliminar_comercio(p_comercio_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug       text;
  t            record;
  v_n          bigint;
  v_pendientes int;
  v_pasadas    int := 0;
  v_borradas   jsonb := '{}'::jsonb;
begin
  select slug into v_slug from comercios where id = p_comercio_id;
  if v_slug is null then
    raise exception 'Comercio inexistente';
  end if;
  if v_slug = 'demo' then
    raise exception 'La demo no se puede eliminar';
  end if;

  loop
    v_pasadas := v_pasadas + 1;
    v_pendientes := 0;
    for t in
      select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'comercio_id'
        and c.table_name <> 'comercios'
        and tb.table_type = 'BASE TABLE'
      order by c.table_name
    loop
      begin
        execute format('delete from %I where comercio_id = $1', t.table_name) using p_comercio_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_borradas := v_borradas || jsonb_build_object(
            t.table_name, coalesce((v_borradas ->> t.table_name)::bigint, 0) + v_n
          );
        end if;
      exception when foreign_key_violation then
        v_pendientes := v_pendientes + 1;
      end;
    end loop;
    exit when v_pendientes = 0 or v_pasadas >= 10;
  end loop;

  if v_pendientes > 0 then
    raise exception 'No se pudo borrar todo: % tabla(s) siguen con dependencias', v_pendientes;
  end if;

  delete from comercios where id = p_comercio_id;
  return v_borradas;
end;
$$;

revoke all on function eliminar_comercio(text) from public, anon, authenticated;
