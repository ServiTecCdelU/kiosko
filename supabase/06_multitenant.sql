-- ============================================================
-- Kiosko Despensa — Fase 0: Fundación multi-tenant (SaaS)
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO
-- (después de 01..05). Es NO destructivo: backfilea los datos
-- actuales como el primer comercio ('comercio_1').
--
-- Estrategia:
--   • Nueva tabla `comercios` (tenant) con credenciales de
--     Mercado Pago y datos de suscripción.
--   • `comercio_id` en todas las tablas de dominio, backfilleado
--     a 'comercio_1' (los datos existentes = primer comercio).
--   • `productos` pasa a ser POR COMERCIO: se agrega `dist_id`
--     (el id de la distribuidora, para la sync) y se conserva el
--     `id` actual intacto → sin romper FKs ni items de ventas.
--
-- NOTA TRANSITORIA: varias columnas `comercio_id` llevan
--   DEFAULT 'comercio_1' para que las RPC e inserts actuales
--   sigan funcionando SIN tocar código. En la Fase 1 (código),
--   las RPC reciben p_comercio_id explícito y se QUITAN estos
--   defaults (ver bloque final "PENDIENTE FASE 1").
-- ============================================================

-- ------------------------------------------------------------
-- COMERCIOS — el tenant. Cada kiosco/despensa es un comercio.
-- ------------------------------------------------------------
create table if not exists comercios (
  id          text primary key,
  nombre      text not null,
  slug        text not null unique,                 -- identificador para URL/subdominio
  estado      text not null default 'activo'        -- 'activo'|'prueba'|'suspendido'|'baja'
                check (estado in ('activo','prueba','suspendido','baja')),
  plan        text not null default 'free'          -- 'free'|'basico'|'pro'
                check (plan in ('free','basico','pro')),

  -- Suscripción (billing del SaaS)
  trial_hasta        timestamptz,
  suscripcion_hasta  timestamptz,

  -- Mercado Pago POR COMERCIO (Fase 1)
  -- TODO SEGURIDAD: cifrar el access_token (pgcrypto/Supabase Vault)
  -- antes de operar con cuentas reales. Por ahora texto plano.
  mp_user_id       text,
  mp_access_token  text,
  mp_refresh_token text,
  mp_public_key    text,
  mp_conectado_at  timestamptz,

  -- Configuración libre: moneda, datos fiscales, preferencias de ticket, etc.
  config      jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Comercio inicial = los datos que ya existen hoy.
insert into comercios (id, nombre, slug, estado, plan)
values ('comercio_1', 'Kiosko Despensa', 'kiosko-despensa', 'activo', 'pro')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- PRODUCTOS — pasa a ser por comercio.
--   • dist_id = id del catálogo de la distribuidora (clave de sync).
--   • para 'comercio_1' conservamos el id actual (id == dist_id),
--     así no se rompe ninguna FK ni los items jsonb de ventas.
--   • comercios nuevos generarán id propio (p.ej. comercio_2__<dist_id>).
-- ------------------------------------------------------------
alter table productos add column if not exists comercio_id text default 'comercio_1';
alter table productos add column if not exists dist_id     text;

update productos set comercio_id = 'comercio_1' where comercio_id is null;
update productos set dist_id = id                where dist_id is null;

alter table productos
  add constraint fk_productos_comercio
  foreign key (comercio_id) references comercios(id) on delete cascade;

alter table productos alter column comercio_id set not null;

-- Un mismo producto de la distribuidora es único POR comercio.
create unique index if not exists uq_productos_comercio_dist
  on productos (comercio_id, dist_id);
create index if not exists idx_productos_comercio on productos (comercio_id);

-- ------------------------------------------------------------
-- CAJA
-- ------------------------------------------------------------
alter table caja add column if not exists comercio_id text default 'comercio_1';
update caja set comercio_id = 'comercio_1' where comercio_id is null;
alter table caja
  add constraint fk_caja_comercio
  foreign key (comercio_id) references comercios(id) on delete cascade;
alter table caja alter column comercio_id set not null;
create index if not exists idx_caja_comercio on caja (comercio_id);

-- ------------------------------------------------------------
-- VENTAS
-- ------------------------------------------------------------
alter table ventas add column if not exists comercio_id text default 'comercio_1';
update ventas set comercio_id = 'comercio_1' where comercio_id is null;
alter table ventas
  add constraint fk_ventas_comercio
  foreign key (comercio_id) references comercios(id) on delete cascade;
alter table ventas alter column comercio_id set not null;
create index if not exists idx_ventas_comercio on ventas (comercio_id, created_at desc);

-- ------------------------------------------------------------
-- STOCK_MOVIMIENTOS
-- ------------------------------------------------------------
alter table stock_movimientos add column if not exists comercio_id text default 'comercio_1';
update stock_movimientos set comercio_id = 'comercio_1' where comercio_id is null;
alter table stock_movimientos
  add constraint fk_stockmov_comercio
  foreign key (comercio_id) references comercios(id) on delete cascade;
alter table stock_movimientos alter column comercio_id set not null;
create index if not exists idx_stockmov_comercio on stock_movimientos (comercio_id, fecha desc);

-- ------------------------------------------------------------
-- SYNC_LOG
-- ------------------------------------------------------------
alter table sync_log add column if not exists comercio_id text default 'comercio_1';
update sync_log set comercio_id = 'comercio_1' where comercio_id is null;
alter table sync_log
  add constraint fk_synclog_comercio
  foreign key (comercio_id) references comercios(id) on delete cascade;
alter table sync_log alter column comercio_id set not null;
create index if not exists idx_synclog_comercio on sync_log (comercio_id, started_at desc);

-- ------------------------------------------------------------
-- USUARIOS — cada usuario pertenece a un comercio.
-- (El staff de la plataforma se modelará aparte más adelante.)
-- ------------------------------------------------------------
alter table usuarios add column if not exists comercio_id text default 'comercio_1';
update usuarios set comercio_id = 'comercio_1' where comercio_id is null;
alter table usuarios
  add constraint fk_usuarios_comercio
  foreign key (comercio_id) references comercios(id) on delete cascade;
alter table usuarios alter column comercio_id set not null;
create index if not exists idx_usuarios_comercio on usuarios (comercio_id);

-- ------------------------------------------------------------
-- CLIENTES (fiado) — creadas en 05_clientes_fiado.sql.
-- Se protege con "if exists" por si 05 aún no se ejecutó.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.clientes') is not null then
    alter table clientes add column if not exists comercio_id text default 'comercio_1';
    update clientes set comercio_id = 'comercio_1' where comercio_id is null;
    if not exists (
      select 1 from pg_constraint where conname = 'fk_clientes_comercio'
    ) then
      alter table clientes
        add constraint fk_clientes_comercio
        foreign key (comercio_id) references comercios(id) on delete cascade;
    end if;
    alter table clientes alter column comercio_id set not null;
    create index if not exists idx_clientes_comercio on clientes (comercio_id);
  end if;

  if to_regclass('public.cuenta_corriente_mov') is not null then
    alter table cuenta_corriente_mov add column if not exists comercio_id text default 'comercio_1';
    update cuenta_corriente_mov set comercio_id = 'comercio_1' where comercio_id is null;
    if not exists (
      select 1 from pg_constraint where conname = 'fk_ccmov_comercio'
    ) then
      alter table cuenta_corriente_mov
        add constraint fk_ccmov_comercio
        foreign key (comercio_id) references comercios(id) on delete cascade;
    end if;
    alter table cuenta_corriente_mov alter column comercio_id set not null;
    create index if not exists idx_ccmov_comercio on cuenta_corriente_mov (comercio_id, fecha desc);
  end if;
end$$;

-- ------------------------------------------------------------
-- VENTAS — soportar pago por QR de Mercado Pago (Fase 1).
-- Se amplía el constraint de medios de pago y se guarda la
-- referencia del pago MP para conciliar con el webhook.
-- ------------------------------------------------------------
alter table ventas add column if not exists payment_ref text;   -- id de pago/orden MP

alter table ventas drop constraint if exists ventas_payment_method_check;
alter table ventas add constraint ventas_payment_method_check
  check (payment_method in ('efectivo','transferencia','mixto','fiado','qr'));

-- ============================================================
-- PENDIENTE FASE 1 (código) — NO ejecutar todavía, queda como guía:
--   1. Reactivar auth (AUTH_DISABLED=false) y resolver comercio_id
--      del usuario logueado en cada request del server.
--   2. Reescribir RPC con p_comercio_id explícito:
--        process_sale_kiosko(..., p_comercio_id)
--        ajustar_stock_kiosko(..., p_comercio_id)
--        registrar_pago_cuenta(..., p_comercio_id)
--      validando que caja/producto/cliente pertenezcan al comercio.
--   3. Quitar los DEFAULT 'comercio_1' transitorios:
--        alter table productos          alter column comercio_id drop default;
--        alter table caja               alter column comercio_id drop default;
--        alter table ventas             alter column comercio_id drop default;
--        alter table stock_movimientos  alter column comercio_id drop default;
--        alter table sync_log           alter column comercio_id drop default;
--        alter table usuarios           alter column comercio_id drop default;
--        alter table clientes           alter column comercio_id drop default;
--        alter table cuenta_corriente_mov alter column comercio_id drop default;
--   4. Activar RLS + políticas por comercio_id (endurecimiento).
--   5. Cifrar comercios.mp_access_token (pgcrypto/Vault).
-- ============================================================
