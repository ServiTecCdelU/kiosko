-- ============================================================
-- Kiosko Despensa — Desactivar RLS
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO.
--
-- Por que: el front usa el cliente anon directamente desde el
-- navegador y NO hay Supabase Auth (el login es por PIN propio
-- contra la tabla usuarios). Con RLS activado y sin politicas,
-- Postgres bloquea todas las operaciones del rol anon
-- (abrir caja, ventas, ajustes de stock, etc.).
--
-- El anon key viaja en el bundle del cliente, asi que RLS no
-- aporta seguridad real en este modelo; el diseno original
-- contempla las tablas SIN RLS (ver 01_schema.sql).
-- ============================================================

alter table productos          disable row level security;
alter table caja               disable row level security;
alter table ventas             disable row level security;
alter table stock_movimientos  disable row level security;
alter table sync_log           disable row level security;
alter table usuarios           disable row level security;
