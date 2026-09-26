-- 33_superadmin.sql
-- Panel de superadmin: gestion de comercios cruzando todo el SaaS, fuera del
-- alcance de comercio_id de cualquier tenant individual. Item 5.2 del plan
-- maestro. No destructivo.
--
-- Login: la MISMA cuenta de Google que ya usan los admins de cada comercio
-- (Supabase Auth, ver app/auth/callback/route.ts), pero matcheada contra esta
-- tabla en vez de `usuarios`. No requiere RPC: se lee/escribe directo con
-- supabaseAdmin (service role) desde rutas /api/superadmin/*, que validan la
-- cookie de sesion con superadmin=true antes de tocar nada.

create table if not exists superadmins (
  email      text primary key,
  nombre     text,
  created_at timestamptz not null default now()
);
alter table superadmins disable row level security;

-- ------------------------------------------------------------
-- Dar de alta al primer superadmin: reemplazar el correo y el nombre y
-- correr esta linea aparte.
--   insert into superadmins (email, nombre) values ('tu-correo@gmail.com', 'Tu Nombre');
-- ------------------------------------------------------------
