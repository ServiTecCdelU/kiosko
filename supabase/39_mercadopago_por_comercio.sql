-- 39_mercadopago_por_comercio.sql
-- Mercado Pago POR COMERCIO con el access token cifrado.
--
-- Hasta ahora todos los cobros (QR y Point) usaban un unico MP_ACCESS_TOKEN de
-- entorno: en el SaaS eso manda la plata de todos los comercios a una sola
-- cuenta. Desde aca cada comercio carga su propio token.
--
-- El token se cifra EN LA APP (AES-256-GCM, lib/server/cifrado.ts) con la
-- clave MP_TOKEN_KEY, que vive solo en las variables de entorno del servidor.
-- La base guarda el texto cifrado: una fuga de la base sola no expone tokens.
--
-- No destructivo para datos en uso: las columnas viejas en texto plano
-- (06_multitenant) nunca se usaron desde el codigo; se eliminan solo si estan
-- vacias. Re-ejecutable.

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------
alter table comercios add column if not exists mp_token_cifrado text;
-- Ultimos 4 caracteres del token, para mostrar "conectado ···1234" sin descifrar.
alter table comercios add column if not exists mp_token_final   text;
-- true si el token es de prueba (TEST-...): el QR usa el checkout sandbox.
alter table comercios add column if not exists mp_sandbox       boolean not null default false;
-- mp_user_id y mp_conectado_at ya existen (06_multitenant.sql). mp_user_id se
-- completa al guardar el token (GET /users/me) y lo usa el webhook para saber
-- de que comercio es un pago.

-- ------------------------------------------------------------
-- 2. El webhook busca el comercio por la cuenta de MP que cobro.
--    No es unico: un mismo dueño puede usar su cuenta en dos locales.
-- ------------------------------------------------------------
create index if not exists idx_comercios_mp_user_id
  on comercios (mp_user_id) where mp_user_id is not null;

-- ------------------------------------------------------------
-- 3. Columnas viejas en texto plano: se eliminan solo si estan vacias.
--    Si alguna tiene datos, se avisa y se dejan: cargar ese token desde la
--    pantalla nueva y despues correr a mano:
--      alter table comercios drop column mp_access_token;
--      alter table comercios drop column mp_refresh_token;
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'comercios' and column_name = 'mp_access_token'
  ) then
    if exists (
      select 1 from comercios
      where coalesce(mp_access_token, '') <> '' or coalesce(mp_refresh_token, '') <> ''
    ) then
      raise notice 'Hay tokens de Mercado Pago en texto plano en comercios: no se borran las columnas viejas.';
    else
      alter table comercios drop column if exists mp_access_token;
      alter table comercios drop column if exists mp_refresh_token;
    end if;
  end if;
end $$;
