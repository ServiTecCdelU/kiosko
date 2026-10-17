-- 60_demo_visitas.sql — quien entra a la demo publica.
-- Antes de entrar a la demo (boton "Mirá el sistema ya" de la landing y
-- "Acceso a demo" del login) se pide nombre y WhatsApp; cada entrada queda
-- aca para que el superadmin vea quien la probo y le pueda escribir.
--
-- Es del SaaS, no de un comercio: por eso no lleva comercio_id (como
-- superadmins). Solo la escribe el servidor (service role) y la lee el
-- superadmin. No destructivo. Re-ejecutable.

create table if not exists demo_visitas (
  id          bigserial primary key,
  nombre      text not null,
  telefono    text not null,
  origen      text,              -- 'landing' | 'login'
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_demo_visitas_fecha on demo_visitas (created_at desc);
create index if not exists idx_demo_visitas_telefono on demo_visitas (telefono);
alter table demo_visitas enable row level security;

notify pgrst, 'reload schema';
