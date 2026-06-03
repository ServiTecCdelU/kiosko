-- ============================================================
-- Kiosko Despensa — Fase 7: usuario administrador inicial
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO
-- (despues de 01_schema.sql).
--
-- NOTA DE SEGURIDAD: el PIN se guarda en texto plano por simplicidad.
-- Cambia el PIN '1234' por uno propio. Para mayor seguridad, mas
-- adelante se puede migrar a hash (pgcrypto).
-- ============================================================

insert into usuarios (id, nombre, pin, rol, activo)
values ('usuario_admin_1', 'Administrador', '1234', 'admin', true)
on conflict (id) do nothing;

-- Ejemplo de cajero (opcional, descomentar y cambiar el PIN):
-- insert into usuarios (id, nombre, pin, rol, activo)
-- values ('usuario_cajero_1', 'Cajero', '5678', 'cajero', true)
-- on conflict (id) do nothing;
