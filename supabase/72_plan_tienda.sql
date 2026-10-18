-- 72_plan_tienda.sql — plan Tienda ($80.000): todo lo del Pro + catálogo online con
-- pedido por WhatsApp (spec docs/superpowers/specs/2026-10-18-plan-tienda-design.md).
-- Suma 'tienda' a los planes válidos y su tarifa (mismas cajas que el Pro), editable
-- después desde el superadmin. No toca los planes existentes. Re-ejecutable.

begin;

alter table comercios drop constraint if exists comercios_plan_check;
alter table comercios add constraint comercios_plan_check
  check (plan = any (array['free', 'basico', 'pro', 'tienda']));

alter table saas_planes drop constraint if exists saas_planes_plan_check;
alter table saas_planes add constraint saas_planes_plan_check
  check (plan = any (array['free', 'basico', 'pro', 'tienda']));

insert into saas_planes (plan, nombre, precio_mensual, descripcion, cajas_incluidas, precio_caja_extra, max_cajas)
select 'tienda', 'Tienda', 80000,
       'Todo lo del Pro más tu catálogo online: tus clientes ven productos, precios y ofertas y te mandan el pedido por WhatsApp.',
       cajas_incluidas, precio_caja_extra, max_cajas
  from saas_planes where plan = 'pro'
on conflict (plan) do nothing;

commit;
