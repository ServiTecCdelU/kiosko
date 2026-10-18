-- 74_pedidos_pago_online.sql — pago online con Mercado Pago de los pedidos de la tienda
-- (plan Tienda, etapa 3). Spec: docs/superpowers/specs/2026-10-18-plan-tienda-design.md
--
-- El cliente paga el total del pedido por adelantado con la cuenta de MP del comercio.
-- pago_estado: null = paga al retirar/recibir; 'pendiente' = se genero el link y todavia
-- no pago; 'aprobado' = MP confirmo el pago (webhook, consultado con el token del
-- comercio); 'rechazado'. Un pedido aprobado no se cobra de nuevo en la caja: se entrega
-- desde Pedidos y la venta queda al precio pagado. No destructiva y re-ejecutable.

alter table pedidos add column if not exists pago_estado text;
alter table pedidos add column if not exists pago_ref text;
alter table pedidos add column if not exists pago_id text;
alter table pedidos add column if not exists pago_monto numeric;

do $$ begin
  alter table pedidos add constraint pedidos_pago_estado_check
    check (pago_estado is null or pago_estado in ('pendiente', 'aprobado', 'rechazado'));
exception when duplicate_object then null; end $$;

create unique index if not exists idx_pedidos_pago_ref on pedidos (pago_ref) where pago_ref is not null;

notify pgrst, 'reload schema';
