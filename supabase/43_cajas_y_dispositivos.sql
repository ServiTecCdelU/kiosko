-- 43_cajas_y_dispositivos.sql
-- Como entra la cajera a su caja (decidido 2026-10-03):
--   1. Una vez por PC, el dueño la registra: "esta PC es la Caja 1".
--   2. Cada dia la cajera pone su PIN de 6 numeros en esa PC y entra a SU caja.
--   3. El PIN se busca solo dentro del comercio de la PC (nunca se cruza con
--      otro comercio) y solo funciona en PCs registradas por el dueño.
--   4. Cada caja puede tener su punto de venta de AFIP.
--   5. 5 PIN equivocados bloquean esa PC 15 minutos (guardado en la base).
--
-- Re-ejecutable. Solo borra lo del paso 0 (sin uso).

-- ------------------------------------------------------------
-- 0. Se descarto la idea de un codigo con letras por comercio (ej. B-482913).
--    Si se llego a correr ese SQL, se saca lo que agrego y no se usa.
--    (debe_cambiar_pin y login_intentos sirven igual: se conservan.)
-- ------------------------------------------------------------
drop index if exists idx_comercios_prefijo_empleados;
alter table comercios drop column if exists prefijo_empleados;
drop sequence if exists comercios_prefijo_seq;
drop function if exists prefijo_de_numero(bigint);

-- ------------------------------------------------------------
-- 1. PCs registradas. La PC guarda una cookie firmada con su id; aca se
--    puede dar de baja (si la roban o cambia de caja).
-- ------------------------------------------------------------
create table if not exists dispositivos (
  id          text primary key,
  comercio_id text not null references comercios(id) on delete cascade,
  puesto_id   text not null references puestos(id),
  nombre      text not null,                 -- ej. "PC del mostrador"
  activo      boolean not null default true,
  creado_por  text,
  created_at  timestamptz not null default now(),
  ultimo_uso  timestamptz
);
create index if not exists idx_dispositivos_comercio on dispositivos (comercio_id) where activo;
alter table dispositivos enable row level security;
revoke all on table dispositivos from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Punto de venta de AFIP por caja (opcional: sin dato se usa el general
--    de afip_config.punto_venta).
-- ------------------------------------------------------------
alter table puestos add column if not exists punto_venta_afip integer
  check (punto_venta_afip is null or punto_venta_afip between 1 and 99999);

-- ------------------------------------------------------------
-- 3. PIN de 6 numeros. Los empleados con PIN de 4 entran una ultima vez
--    y el sistema les pide elegir uno nuevo de 6 antes de seguir.
-- ------------------------------------------------------------
-- Solo la primera vez (cuando se crea la columna): si se vuelve a correr no
-- marca de nuevo a quien ya eligio su PIN de 6.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios' and column_name = 'debe_cambiar_pin'
  ) then
    alter table usuarios add column debe_cambiar_pin boolean not null default false;
    update usuarios set debe_cambiar_pin = true where pin_hash is not null and rol <> 'admin';
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Intentos fallidos de PIN (por PC). Antes se contaban en la memoria de
--    cada servidor: con varios servidores el limite real era mucho mayor.
-- ------------------------------------------------------------
create table if not exists login_intentos (
  clave           text primary key,      -- ej. "disp:<id de la PC>"
  fallos          integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado     timestamptz not null default now()
);
alter table login_intentos enable row level security;
revoke all on table login_intentos from anon, authenticated;

-- Suma un fallo; al llegar a p_max dentro de la ventana, bloquea p_minutos.
-- Devuelve hasta cuando queda bloqueado (null = todavia puede intentar).
create or replace function registrar_fallo_login(p_clave text, p_max integer, p_minutos integer)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fallos integer;
  v_hasta  timestamptz;
begin
  insert into login_intentos as li (clave, fallos, actualizado)
  values (p_clave, 1, now())
  on conflict (clave) do update set
    -- fallos viejos (pasada la ventana) no cuentan
    fallos = case when li.actualizado < now() - make_interval(mins => p_minutos) then 1 else li.fallos + 1 end,
    actualizado = now()
  returning fallos, bloqueado_hasta into v_fallos, v_hasta;

  if v_fallos >= p_max then
    update login_intentos
      set bloqueado_hasta = now() + make_interval(mins => p_minutos), fallos = 0
      where clave = p_clave
      returning bloqueado_hasta into v_hasta;
  end if;
  return case when v_hasta > now() then v_hasta else null end;
end;
$$;

revoke all on function registrar_fallo_login(text, integer, integer) from public, anon, authenticated;
