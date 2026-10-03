-- 40_autoregistro.sql
-- Onboarding self-service: un dueño entra con Google en /registro, completa
-- los datos de su comercio y arranca la prueba al instante.
-- Spec: docs/superpowers/specs/2026-10-03-autoregistro-design.md
--
-- No destructivo. Re-ejecutable. Requiere 32_login_google_empleados.sql
-- (crear_empleado_kiosko) y 26_multi_caja.sql (puestos).

-- ------------------------------------------------------------
-- 1. Alta atomica: comercio + admin + primer puesto de caja, o nada.
--    - Una cuenta de Google = un comercio: si el correo ya es admin activo
--      de algun comercio (o superadmin), falla con 'YA_REGISTRADO'.
--    - El lock por correo evita que dos envios simultaneos creen dos comercios.
--    - Si el slug esta tomado se le agrega -2, -3, ...
--    - Los datos del alta (origen, rubro, telefono) van en comercios.config:
--      no hace falta columna nueva.
-- ------------------------------------------------------------
create or replace function registrar_comercio_autoservicio(
  p_email           text,
  p_nombre_comercio text,
  p_slug_base       text,
  p_nombre_admin    text,
  p_telefono        text,
  p_rubro           text,
  p_trial_dias      integer default 14
) returns table (nuevo_id text, nuevo_slug text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id    text := 'comercio_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_slug  text := p_slug_base;
  v_n     integer := 1;
begin
  if v_email = '' then
    raise exception 'Falta el correo';
  end if;
  if coalesce(trim(p_nombre_comercio), '') = '' then
    raise exception 'El nombre del comercio es obligatorio';
  end if;
  if coalesce(p_slug_base, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Direccion del panel invalida';
  end if;
  if p_trial_dias is null or p_trial_dias not between 1 and 60 then
    raise exception 'Dias de prueba invalidos';
  end if;

  perform pg_advisory_xact_lock(hashtext('autoregistro:' || v_email));

  if exists (
    select 1 from usuarios u
    where u.rol = 'admin' and u.activo and lower(u.email) = v_email
  ) or exists (
    select 1 from superadmins s where lower(s.email) = v_email
  ) then
    raise exception 'YA_REGISTRADO';
  end if;

  while exists (select 1 from comercios c where c.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := p_slug_base || '-' || v_n;
  end loop;

  insert into comercios (id, nombre, slug, estado, plan, trial_hasta, config)
  values (
    v_id, trim(p_nombre_comercio), v_slug, 'prueba', 'free',
    now() + make_interval(days => p_trial_dias),
    jsonb_build_object(
      'origen',   'autoregistro',
      'rubro',    nullif(trim(coalesce(p_rubro, '')), ''),
      'telefono', nullif(trim(coalesce(p_telefono, '')), '')
    )
  );

  perform crear_empleado_kiosko(v_id, p_nombre_admin, 'admin', v_email, p_telefono);

  insert into puestos (id, comercio_id, nombre)
  values ('puesto_' || substr(md5(random()::text || v_id), 1, 12), v_id, 'Caja 1');

  return query select v_id, v_slug;
end;
$$;

-- Solo la llama el servidor (service role) desde app/api/registro.
revoke all on function registrar_comercio_autoservicio(text, text, text, text, text, text, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. BUG existente: los comercios creados desde el superadmin despues de la
--    migracion 26 nacieron sin puesto de caja, y sin puesto no se puede abrir
--    la caja. Se les crea "Caja 1" (mismo criterio que 26_multi_caja.sql).
--    El superadmin ya lo crea solo desde este cambio.
-- ------------------------------------------------------------
insert into puestos (id, comercio_id, nombre)
select 'puesto_' || substr(md5(random()::text || c.id), 1, 12), c.id, 'Caja 1'
from comercios c
where not exists (select 1 from puestos p where p.comercio_id = c.id);
